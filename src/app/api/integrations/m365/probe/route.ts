// Diagnóstico de la configuración de Microsoft Graph para envío de emails.
// No envía ningún email — solo verifica las capas necesarias:
//   1. Env vars presentes
//   2. Token obtenible (auth client_credentials)
//   3. Scope Mail.Send en el token JWT
//   4. Mailbox from_address existe en el tenant
//   5. Application Access Policy permite acceso (probe GET /messages que requiere mismo permiso)

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
  hint?: string;
};

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id || membership.role !== "owner") {
    return NextResponse.json({ error: "Owner required" }, { status: 403 });
  }

  const checks: CheckResult[] = [];
  const fromAddress = process.env.M365_SEND_FROM_ADDRESS ?? "orders@example.com";

  // ── 1. Env vars
  const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID;
  const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;

  checks.push({
    name: "env_vars",
    ok: Boolean(tenantId && clientId && clientSecret),
    detail: tenantId && clientId && clientSecret ? "Las 3 variables están presentes" : "Faltan variables de entorno",
    hint: !tenantId || !clientId || !clientSecret
      ? "Configurar MICROSOFT_GRAPH_TENANT_ID, MICROSOFT_GRAPH_CLIENT_ID, MICROSOFT_GRAPH_CLIENT_SECRET en Vercel"
      : undefined,
  });

  if (!tenantId || !clientId || !clientSecret) {
    return NextResponse.json({ ok: false, from: fromAddress, checks });
  }

  // ── 2. Token
  let token: string | null = null;
  let tokenScopes: string | null = null;
  try {
    const tokenRes = await fetch(
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
        signal: AbortSignal.timeout(10000),
      },
    );
    const body = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !body.access_token) {
      checks.push({
        name: "graph_token",
        ok: false,
        detail: body.error_description ?? body.error ?? `HTTP ${tokenRes.status}`,
        hint: "Verificar TENANT_ID + CLIENT_ID + CLIENT_SECRET. Si el secret fue rotado en Azure, hay que actualizarlo en Vercel.",
      });
      return NextResponse.json({ ok: false, from: fromAddress, checks });
    }
    token = body.access_token;
    // Decode JWT payload (sin verificar firma — solo para leer scopes)
    const parts = body.access_token.split(".");
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
          roles?: string[];
          scp?: string;
        };
        tokenScopes = Array.isArray(payload.roles) ? payload.roles.join(",") : payload.scp ?? "";
      } catch {
        tokenScopes = null;
      }
    }
    checks.push({
      name: "graph_token",
      ok: true,
      detail: `Token obtenido (expira en ${body.expires_in ?? "?"}s)`,
    });
  } catch (err) {
    checks.push({
      name: "graph_token",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      hint: "Problema de red al hablar con login.microsoftonline.com",
    });
    return NextResponse.json({ ok: false, from: fromAddress, checks });
  }

  // ── 3. Scope Mail.Send
  const hasMailSend = tokenScopes?.split(",").map(s => s.trim()).includes("Mail.Send") ?? false;
  const hasMailRead = tokenScopes?.split(",").map(s => s.trim()).includes("Mail.Read") ?? false;
  checks.push({
    name: "scope_mail_send",
    ok: hasMailSend,
    detail: hasMailSend
      ? `Mail.Send presente${hasMailRead ? " (+ Mail.Read)" : ""}`
      : tokenScopes
        ? `Token solo tiene: ${tokenScopes}`
        : "No se pudo leer el token",
    hint: !hasMailSend
      ? "Azure Portal → App registrations → API permissions → Add → Microsoft Graph → Application permissions → Mail.Send. Después: Grant admin consent."
      : undefined,
  });

  if (!hasMailSend) {
    return NextResponse.json({ ok: false, from: fromAddress, checks });
  }

  // ── 4. Acceso real al buzón vía sendMail con un payload vacío.
  // Esto es el test definitivo: si Graph acepta la auth (devuelve 400 BadRequest por
  // el body vacío) sabemos que Mail.Send está concedido Y que la Application Access
  // Policy de Exchange permite a esta app actuar sobre el buzón.
  // Si devuelve 403 ErrorAccessDenied → falta la policy de Exchange.
  // Evitamos endpoints como GET /users/{id} o /messages porque requieren permisos
  // adicionales (User.Read.All / Mail.Read) que no son necesarios para enviar.
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        // Body intencionalmente vacío: Graph responderá 400 si la auth/policy está OK,
        // o 403 ErrorAccessDenied si la Application Access Policy bloquea.
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (res.status === 400) {
      // 400 = auth + policy OK, solo el body es inválido (esperado).
      checks.push({
        name: "mailbox_access",
        ok: true,
        detail: `Acceso a ${fromAddress} concedido ✓ (Mail.Send + Application Access Policy)`,
      });
    } else if (res.status === 202 || res.ok) {
      // Improbable con body vacío, pero por completitud.
      checks.push({
        name: "mailbox_access",
        ok: true,
        detail: `Graph aceptó la solicitud (HTTP ${res.status})`,
      });
    } else {
      const body = await res.text().catch(() => "");
      const bodyLower = body.toLowerCase();
      const isPolicyError = res.status === 403 && bodyLower.includes("erroraccessdenied");
      const isMailboxMissing = res.status === 404;
      checks.push({
        name: "mailbox_access",
        ok: false,
        detail: isPolicyError
          ? `Exchange bloqueó el acceso (Application Access Policy faltante)`
          : isMailboxMissing
            ? `Buzón ${fromAddress} no encontrado en el tenant`
            : `HTTP ${res.status}: ${body.slice(0, 150)}`,
        hint: isPolicyError
          ? `El admin de M365 debe correr en PowerShell de Exchange Online: New-ApplicationAccessPolicy -AppId ${clientId} -PolicyScopeGroupId ${fromAddress} -AccessRight RestrictAccess. Esperar 15-30 min de propagación.`
          : isMailboxMissing
            ? `Verificar que el buzón exista y tenga licencia Exchange Online.`
            : undefined,
      });
    }
  } catch (err) {
    checks.push({
      name: "mailbox_access",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const overallOk = checks.every((c) => c.ok);
  return NextResponse.json({
    ok: overallOk,
    from: fromAddress,
    checks,
  });
}
