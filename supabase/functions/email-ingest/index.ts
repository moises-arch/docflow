import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  type Adapter,
  type EmailSource,
  type ParsedAttachment,
  type ParsedEmail,
  detectProvider,
  domainOf,
  normalizeEmail,
  parseAddress,
  persistInboundEmail,
  recipientList,
  recordEvent,
  senderAllowed,
} from "../_shared/email-pipeline.ts";

// Webhook adapters supported by this function. The IMAP adapter does NOT live
// here — it is pulled by `email-ingest-imap-poll` on a cron schedule.
type WebhookAdapter = Exclude<Adapter, "imap">;

const SUPPORTED_WEBHOOK_ADAPTERS: readonly WebhookAdapter[] = [
  "resend",
  "mailgun",
  "microsoft_graph",
  "sendgrid",
  "generic",
];

type GraphNotification = {
  subscriptionId?: string;
  changeType?: string;
  resource?: string;
  clientState?: string;
  resourceData?: {
    id?: string;
    "@odata.id"?: string;
  };
};

type GraphMessage = {
  id: string;
  internetMessageId?: string;
  subject?: string | null;
  from?: { emailAddress?: { name?: string | null; address?: string | null } };
  toRecipients?: Array<{ emailAddress?: { address?: string | null } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string | null } }>;
  body?: { contentType?: string; content?: string | null };
  bodyPreview?: string | null;
  hasAttachments?: boolean;
};

type GraphAttachment = {
  id: string;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  isInline?: boolean | null;
  contentId?: string | null;
  contentBytes?: string | null;
  "@odata.type"?: string;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function getWebhookSecret(req: Request, url: URL) {
  return req.headers.get("x-intake-webhook-secret") ?? url.searchParams.get("secret");
}

function webhookSecretAllowed(req: Request, url: URL, source: EmailSource) {
  const provided = getWebhookSecret(req, url);
  const globalSecret = Deno.env.get("INTAKE_EMAIL_WEBHOOK_SECRET");
  const sourceSecret =
    typeof source.settings?.webhook_secret === "string"
      ? (source.settings.webhook_secret as string)
      : null;
  if (!provided) return false;
  return provided === sourceSecret || provided === globalSecret;
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function parseRequest(req: Request, adapter: Adapter): Promise<ParsedEmail> {
  if (adapter === "mailgun" || adapter === "sendgrid") {
    return parseFormEmail(req, adapter);
  }
  if (adapter === "microsoft_graph") {
    throw new Error("microsoft_graph_requires_notification_context");
  }
  return parseJsonEmail(req, adapter);
}

async function parseJsonEmail(req: Request, adapter: Adapter): Promise<ParsedEmail> {
  const body = (await req.json()) as Record<string, unknown>;
  const data = (body.data && typeof body.data === "object" ? body.data : body) as Record<
    string,
    unknown
  >;
  const from = parseAddress(String(data.from ?? ""));
  const recipients = recipientList(data.to ?? data.recipients);
  const messageId = String(
    data.message_id ?? data.messageId ?? data.email_id ?? body.id ?? crypto.randomUUID(),
  );
  const attachments: ParsedAttachment[] = Array.isArray(data.attachments)
    ? (data.attachments as Record<string, unknown>[]).map((attachment) => ({
        filename: String(attachment.filename ?? attachment.name ?? "attachment"),
        contentType: String(
          attachment.content_type ?? attachment.contentType ?? "application/octet-stream",
        ),
        size: Number(attachment.size ?? 0),
        disposition:
          typeof attachment.content_disposition === "string"
            ? attachment.content_disposition
            : null,
        contentId: typeof attachment.content_id === "string" ? attachment.content_id : null,
        downloadUrl: typeof attachment.download_url === "string" ? attachment.download_url : null,
        externalId: typeof attachment.id === "string" ? attachment.id : null,
      }))
    : [];

  return {
    adapter,
    eventId:
      typeof body.id === "string"
        ? body.id
        : typeof data.email_id === "string"
          ? data.email_id
          : null,
    messageId,
    fromEmail: from.email,
    fromName: from.name,
    recipients,
    subject: typeof data.subject === "string" ? data.subject : null,
    text:
      typeof data.text === "string"
        ? data.text
        : typeof data.text_body === "string"
          ? data.text_body
          : null,
    html:
      typeof data.html === "string"
        ? data.html
        : typeof data.html_body === "string"
          ? data.html_body
          : null,
    raw: body,
    attachments,
  };
}

async function parseFormEmail(req: Request, adapter: Adapter): Promise<ParsedEmail> {
  const form = await req.formData();
  const from = parseAddress(String(form.get("from") ?? form.get("sender") ?? ""));
  const to = form.get("to") ?? form.get("recipient") ?? form.get("envelope");
  const envelopeRecipients = parseEnvelopeRecipients(to);
  const messageId =
    parseMessageIdFromHeaders(String(form.get("headers") ?? form.get("message-headers") ?? "")) ??
    String(form.get("Message-Id") ?? form.get("message-id") ?? crypto.randomUUID());
  const attachments: ParsedAttachment[] = [];

  for (const [key, value] of form.entries()) {
    if (!(value instanceof File)) continue;
    if (!key.startsWith("attachment")) continue;
    attachments.push({
      filename: value.name || key,
      contentType: value.type || "application/octet-stream",
      size: value.size,
      disposition: null,
      contentId: null,
      bytes: await value.arrayBuffer(),
    });
  }

  return {
    adapter,
    eventId: String(form.get("sg_event_id") ?? form.get("token") ?? messageId),
    messageId,
    fromEmail: from.email,
    fromName: from.name,
    recipients:
      envelopeRecipients.length > 0 ? envelopeRecipients : recipientList(String(to ?? "")),
    subject: stringForm(form, "subject"),
    text: stringForm(form, adapter === "mailgun" ? "body-plain" : "text"),
    html: stringForm(form, adapter === "mailgun" ? "body-html" : "html"),
    raw: Object.fromEntries(
      [...form.entries()]
        .filter(([, value]) => !(value instanceof File))
        .map(([key, value]) => [key, String(value)]),
    ),
    attachments,
  };
}

function stringForm(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value : null;
}

function parseEnvelopeRecipients(value: unknown) {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as { to?: unknown };
    return recipientList(parsed.to);
  } catch {
    return recipientList(value);
  }
}

function parseMessageIdFromHeaders(headers: string) {
  if (!headers) return null;
  try {
    const parsed = JSON.parse(headers) as unknown;
    if (Array.isArray(parsed)) {
      const found = parsed.find(
        (item) => Array.isArray(item) && String(item[0]).toLowerCase() === "message-id",
      );
      return found ? String(found[1]) : null;
    }
  } catch {
    const match = headers.match(/^message-id:\s*(.+)$/im);
    return match?.[1]?.trim() ?? null;
  }
  return null;
}

async function verifyMailgunSignature(req: Request, parsed: ParsedEmail) {
  const signingKey = Deno.env.get("MAILGUN_SIGNING_KEY");
  if (!signingKey || parsed.adapter !== "mailgun") return true;
  const raw = parsed.raw as Record<string, string>;
  const timestamp = raw.timestamp;
  const token = raw.token;
  const signature = raw.signature;
  if (!timestamp || !token || !signature) return false;
  // Replay protection: reject Mailgun webhooks signed > 15 min ago.
  const tsSec = Number(timestamp);
  if (!Number.isFinite(tsSec)) return false;
  const ageMs = Date.now() - tsSec * 1000;
  if (ageMs > 15 * 60 * 1000 || ageMs < -60 * 1000) return false;
  return (await hmacHex(signingKey, `${timestamp}${token}`)) === signature;
}

function stringSetting(source: EmailSource, key: string) {
  const value = source.settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function resolveSourceById(
  supabase: ReturnType<typeof createServiceClient>,
  sourceId: string | null,
) {
  if (!sourceId) return null;
  const { data } = await supabase
    .from("email_ingest_sources")
    .select("id, tenant_id, provider_id, address, allowed_senders, settings")
    .eq("id", sourceId)
    .eq("status", "active")
    .maybeSingle();
  return (data as EmailSource | null) ?? null;
}

async function resolveMicrosoftGraphSource(
  supabase: ReturnType<typeof createServiceClient>,
  url: URL,
  notification: GraphNotification,
) {
  const byId = await resolveSourceById(supabase, url.searchParams.get("source_id"));
  if (byId) return byId;
  if (!notification.subscriptionId) return null;
  const { data } = await supabase
    .from("email_ingest_sources")
    .select("id, tenant_id, provider_id, address, allowed_senders, settings")
    .eq("status", "active")
    .eq("settings->>adapter", "microsoft_graph")
    .eq("settings->>graph_subscription_id", notification.subscriptionId)
    .limit(1);
  return (data?.[0] as EmailSource | undefined) ?? null;
}

function graphClientStateAllowed(source: EmailSource, notification: GraphNotification) {
  const expected = stringSetting(source, "graph_client_state");
  return Boolean(expected && notification.clientState && notification.clientState === expected);
}

function graphMessageId(notification: GraphNotification) {
  if (notification.resourceData?.id) return notification.resourceData.id;
  const resource = notification.resourceData?.["@odata.id"] ?? notification.resource ?? "";
  const match = resource.match(/messages\/([^/?]+)/i);
  return match?.[1] ?? null;
}

async function getMicrosoftGraphToken(source: EmailSource) {
  const tenantId =
    stringSetting(source, "graph_tenant_id") ?? Deno.env.get("MICROSOFT_GRAPH_TENANT_ID");
  const clientId =
    stringSetting(source, "graph_client_id") ?? Deno.env.get("MICROSOFT_GRAPH_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_GRAPH_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("microsoft_graph_credentials_missing");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`microsoft_graph_token_failed:${response.status}`);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("microsoft_graph_token_missing");
  return payload.access_token;
}

async function graphGet<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `microsoft_graph_fetch_failed:${response.status}:${body.slice(0, 300)}:url=${url.slice(0, 200)}`,
    );
  }
  return (await response.json()) as T;
}

function graphRecipients(recipients: GraphMessage["toRecipients"]) {
  return (recipients ?? [])
    .map((recipient) => normalizeEmail(recipient.emailAddress?.address))
    .filter(Boolean);
}

function bytesFromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function fetchMicrosoftGraphAttachments(
  mailbox: string,
  messageId: string,
  accessToken: string,
) {
  const attachments: ParsedAttachment[] = [];
  // Note: properties like contentBytes/contentId only exist on
  // microsoft.graph.fileAttachment (derived type). Using $select against the
  // base attachment type causes a 400. Omitting $select returns all available
  // properties including the derived type's fields via @odata.type.
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments`;

  while (nextUrl) {
    const payload = await graphGet<{ value?: GraphAttachment[]; "@odata.nextLink"?: string }>(
      nextUrl,
      accessToken,
    );
    for (const attachment of payload.value ?? []) {
      if (
        attachment["@odata.type"] &&
        attachment["@odata.type"] !== "#microsoft.graph.fileAttachment"
      )
        continue;
      attachments.push({
        filename: attachment.name ?? "attachment",
        contentType: attachment.contentType ?? "application/octet-stream",
        size: attachment.size ?? 0,
        disposition: attachment.isInline ? "inline" : "attachment",
        contentId: attachment.contentId ?? null,
        externalId: attachment.id,
        bytes: attachment.contentBytes ? bytesFromBase64(attachment.contentBytes) : undefined,
      });
    }
    nextUrl = payload["@odata.nextLink"] ?? null;
  }

  return attachments;
}

async function parseMicrosoftGraphEmail(
  source: EmailSource,
  notification: GraphNotification,
  raw: Record<string, unknown>,
): Promise<ParsedEmail> {
  const messageId = graphMessageId(notification);
  if (!messageId) throw new Error("microsoft_graph_message_id_missing");
  const mailbox = stringSetting(source, "graph_mailbox_id") ?? source.address;
  const accessToken = await getMicrosoftGraphToken(source);
  const message = await graphGet<GraphMessage>(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}?$select=id,internetMessageId,subject,from,toRecipients,ccRecipients,body,bodyPreview,hasAttachments`,
    accessToken,
  );
  const attachments = message.hasAttachments
    ? await fetchMicrosoftGraphAttachments(mailbox, message.id, accessToken)
    : [];
  const from = message.from?.emailAddress;
  const bodyContent = message.body?.content ?? null;
  const bodyType = message.body?.contentType?.toLowerCase();

  return {
    adapter: "microsoft_graph",
    eventId: `${notification.subscriptionId ?? "graph"}:${message.id}:${notification.changeType ?? "created"}`,
    messageId: message.internetMessageId ?? message.id,
    fromEmail: normalizeEmail(from?.address),
    fromName: from?.name ?? null,
    recipients: [
      ...graphRecipients(message.toRecipients),
      ...graphRecipients(message.ccRecipients),
    ],
    subject: message.subject ?? null,
    text: bodyType === "text" ? bodyContent : (message.bodyPreview ?? null),
    html: bodyType === "html" ? bodyContent : null,
    raw: {
      notification: raw,
      graph_message_id: message.id,
      graph_mailbox: mailbox,
    },
    attachments,
  };
}

async function resolveSource(
  supabase: ReturnType<typeof createServiceClient>,
  parsed: ParsedEmail,
) {
  const recipients = parsed.recipients.map(normalizeEmail).filter(Boolean);
  if (recipients.length === 0) return null;
  const { data } = await supabase
    .from("email_ingest_sources")
    .select("id, tenant_id, provider_id, address, allowed_senders, settings")
    .in("address", recipients)
    .eq("status", "active")
    .limit(1);
  return (data?.[0] as EmailSource | undefined) ?? null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const startedAt = performance.now();
  const adapter = (url.searchParams.get("adapter") ?? "generic").toLowerCase() as Adapter;

  if (!SUPPORTED_WEBHOOK_ADAPTERS.includes(adapter as WebhookAdapter)) {
    return json({ error: "Unsupported adapter" }, 400);
  }

  const supabase = createServiceClient();
  let parsed: ParsedEmail | null = null;
  let source: EmailSource | null = null;

  try {
    if (adapter === "microsoft_graph") {
      const notificationBody = (await req.json()) as Record<string, unknown>;
      const notification = Array.isArray(notificationBody.value)
        ? (notificationBody.value[0] as GraphNotification | undefined)
        : undefined;
      if (!notification) {
        await recordEvent(supabase, {
          adapter,
          state: "rejected",
          statusCode: 400,
          errorCode: "invalid_graph_notification",
        });
        return json({ error: "Invalid Microsoft Graph notification" }, 400);
      }

      source = await resolveMicrosoftGraphSource(supabase, url, notification);
      if (!source) {
        await recordEvent(supabase, {
          adapter,
          state: "rejected",
          statusCode: 202,
          errorCode: "unknown_graph_source",
        });
        return json({ ok: true, ignored: true }, 202);
      }

      if (!webhookSecretAllowed(req, url, source)) {
        await recordEvent(supabase, {
          adapter,
          source,
          state: "rejected",
          statusCode: 401,
          errorCode: "invalid_webhook_secret",
        });
        return json({ error: "Unauthorized" }, 401);
      }

      if (!graphClientStateAllowed(source, notification)) {
        await recordEvent(supabase, {
          adapter,
          source,
          state: "rejected",
          statusCode: 401,
          errorCode: "invalid_graph_client_state",
        });
        return json({ error: "Invalid clientState" }, 401);
      }

      parsed = await parseMicrosoftGraphEmail(source, notification, notificationBody);
    } else {
      parsed = await parseRequest(req, adapter);
      if (!(await verifyMailgunSignature(req, parsed))) {
        return json({ error: "Invalid signature" }, 401);
      }

      source = await resolveSource(supabase, parsed);
      if (!source) {
        await recordEvent(supabase, {
          adapter,
          state: "rejected",
          statusCode: 406,
          errorCode: "unknown_recipient",
          parsed,
        });
        return json({ error: "Unknown recipient" }, 406);
      }

      if (!webhookSecretAllowed(req, url, source)) {
        await recordEvent(supabase, {
          adapter,
          source,
          state: "rejected",
          statusCode: 401,
          errorCode: "invalid_webhook_secret",
          parsed,
        });
        return json({ error: "Unauthorized" }, 401);
      }
    }

    if (!senderAllowed(source, parsed.fromEmail)) {
      await recordEvent(supabase, {
        adapter,
        source,
        state: "rejected",
        statusCode: 406,
        errorCode: "sender_not_allowed",
        parsed,
      });
      return json({ error: "Sender not allowed" }, 406);
    }

    const result = await persistInboundEmail(supabase, source, parsed);

    if (result.duplicate) {
      await recordEvent(supabase, {
        adapter,
        source,
        inboundEmailId: result.inboundEmailId,
        state: "duplicate",
        statusCode: 200,
        parsed,
      });
      return json({ ok: true, duplicate: true, inbound_email_id: result.inboundEmailId });
    }

    await recordEvent(supabase, {
      adapter,
      source,
      inboundEmailId: result.inboundEmailId,
      state: "accepted",
      statusCode: 200,
      parsed,
      meta: {
        document_count: result.documentIds.length,
        duration_ms: Math.round(performance.now() - startedAt),
      },
    });

    return json({
      ok: true,
      inbound_email_id: result.inboundEmailId,
      document_ids: result.documentIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email ingest error";
    await recordEvent(supabase, {
      adapter,
      source: source ?? undefined,
      state: "failed",
      statusCode: 500,
      errorCode: "email_ingest_failed",
      parsed: parsed ?? undefined,
      meta: { message },
    });
    return json({ error: "email_ingest_failed", detail: message }, 500);
  }
});

// Detect provider helper is re-exported via _shared/email-pipeline.ts
// (kept as named import above to preserve the original surface for tests).
export { detectProvider };
