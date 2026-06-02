// Envío de emails con HTML + fallback plaintext.
// Transporte preferido: Microsoft Graph (orders@example.com).
// Fallback: Mailgun. Si nada configurado → console.log.

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  ok: boolean;
  delivered: number;
  failed: number;
  via?: "graph" | "mailgun" | "console";
  error?: string;
}

// ─── Microsoft Graph ──────────────────────────────────────────────────────

function hasGraphConfig(): boolean {
  return Boolean(
    process.env.MICROSOFT_GRAPH_TENANT_ID &&
      process.env.MICROSOFT_GRAPH_CLIENT_ID &&
      process.env.MICROSOFT_GRAPH_CLIENT_SECRET,
  );
}

// Cache del token de Graph en memoria del proceso (vive lo que viva la lambda).
let graphTokenCache: { token: string; expiresAt: number } | null = null;

async function getGraphToken(): Promise<string> {
  if (graphTokenCache && graphTokenCache.expiresAt > Date.now() + 60_000) {
    return graphTokenCache.token;
  }
  const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID!;
  const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID!;
  const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Graph token failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  graphTokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

async function sendViaGraph(input: SendEmailInput): Promise<SendEmailResult> {
  const fromAddress =
    process.env.M365_SEND_FROM_ADDRESS ?? "orders@example.com";
  const recipients = Array.isArray(input.to) ? input.to : [input.to];

  let token: string;
  try {
    token = await getGraphToken();
  } catch (err) {
    return {
      ok: false,
      delivered: 0,
      failed: recipients.length,
      via: "graph",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const message = {
    subject: input.subject,
    body: { contentType: "HTML", content: input.html },
    toRecipients: recipients.map((email) => ({ emailAddress: { address: email } })),
  };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    },
  );

  if (res.ok || res.status === 202) {
    return {
      ok: true,
      delivered: recipients.length,
      failed: 0,
      via: "graph",
    };
  }

  const detail = await res.text().catch(() => "");
  return {
    ok: false,
    delivered: 0,
    failed: recipients.length,
    via: "graph",
    error: interpretGraphError(res.status, detail, fromAddress),
  };
}

/**
 * Convierte errores crípticos de Graph en mensajes accionables que el operador
 * puede pasar al admin de M365. Cubre los casos más comunes que aparecen al
 * configurar Mail.Send por primera vez.
 */
function interpretGraphError(status: number, body: string, fromAddress: string): string {
  const lower = body.toLowerCase();

  // ErrorAccessDenied (403) — casi siempre es Application Access Policy faltante en Exchange Online
  if (status === 403 && lower.includes("erroraccessdenied")) {
    return `Application Access Policy faltante en Exchange Online. El admin de M365 debe correr en PowerShell de Exchange: New-ApplicationAccessPolicy -AppId <APP_ID> -PolicyScopeGroupId ${fromAddress} -AccessRight RestrictAccess. Espera 15-30 min de propagación.`;
  }
  // InvalidAuthenticationToken (401) — credenciales mal o secret expirado
  if (status === 401) {
    return `Token de Graph inválido o expirado. Verificar que MICROSOFT_GRAPH_CLIENT_SECRET no haya sido rotado en Azure.`;
  }
  // Authorization_RequestDenied — falta scope Mail.Send con admin consent
  if (lower.includes("authorization_requestdenied") || lower.includes("insufficient privileges")) {
    return `Falta permiso Mail.Send (Application) con admin consent en Azure Portal → App registrations → API permissions.`;
  }
  // ErrorInvalidUser (404) — el from address no existe
  if (status === 404 && lower.includes("mailboxnotenabledforras")) {
    return `Mailbox ${fromAddress} no tiene Exchange Online habilitado. Verificar licencia M365.`;
  }
  if (status === 404) {
    return `Mailbox ${fromAddress} no encontrado en el tenant. Verificar dirección y existencia del buzón.`;
  }
  // Throttling
  if (status === 429) {
    return `Microsoft Graph rate-limited (429). Reintentar más tarde.`;
  }
  // Fallback con el detalle original
  return `Graph sendMail ${status}: ${body.slice(0, 200)}`;
}

// ─── Mailgun (fallback) ──────────────────────────────────────────────────

function hasMailgunConfig(): boolean {
  return Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
}

async function sendViaMailgun(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.MAILGUN_API_KEY!;
  const domain = process.env.MAILGUN_DOMAIN!;
  const from = process.env.MAILGUN_FROM ?? `DocFlow <noreply@${domain}>`;
  const auth = Buffer.from(`api:${apiKey}`).toString("base64");

  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  let delivered = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    try {
      const form = new URLSearchParams();
      form.set("from", from);
      form.set("to", recipient);
      form.set("subject", input.subject);
      form.set("html", input.html);
      form.set("text", input.text);

      const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      if (res.ok) {
        delivered++;
      } else {
        const text = await res.text().catch(() => "");
        failed++;
        errors.push(`${recipient}: Mailgun ${res.status}: ${text.slice(0, 100)}`);
      }
    } catch (err) {
      failed++;
      errors.push(`${recipient}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    ok: failed === 0,
    delivered,
    failed,
    via: "mailgun",
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Envía un email HTML a uno o más destinatarios.
 * Best-effort: no throw. Prioridad: Graph → Mailgun → console.log.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  if (recipients.length === 0) return { ok: true, delivered: 0, failed: 0 };

  // Prioridad 1: Microsoft Graph (orders@example.com).
  if (hasGraphConfig()) {
    return sendViaGraph(input);
  }

  // Prioridad 2: Mailgun (legacy).
  if (hasMailgunConfig()) {
    return sendViaMailgun(input);
  }

  // Sin transporte configurado → log y devolver OK silencioso.
  console.log("[email] No transport configured (Graph/Mailgun). Would send:");
  console.log(`  To: ${recipients.join(", ")}`);
  console.log(`  Subject: ${input.subject}`);
  console.log(`  Text: ${input.text.slice(0, 200)}...`);
  return { ok: true, delivered: 0, failed: 0, via: "console" };
}

/** Reemplaza variables {{clave}} en un template string. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? String(vars[key as string]) : `{{${key}}}`,
  );
}
