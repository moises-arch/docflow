// Shared email-ingest pipeline used by both the webhook handler (`email-ingest`)
// and the IMAP poller (`email-ingest-imap-poll`). Persists inbound emails,
// stores attachments as documents and dispatches the AI pipeline.

import { createServiceClient } from "./supabase.ts";
import { secrets } from "./secrets.ts";

export type Adapter =
  | "resend"
  | "mailgun"
  | "microsoft_graph"
  | "sendgrid"
  | "imap"
  | "generic";

export type ParsedAttachment = {
  filename: string;
  contentType: string;
  size: number;
  disposition?: string | null;
  contentId?: string | null;
  bytes?: ArrayBuffer;
  downloadUrl?: string | null;
  externalId?: string | null;
};

export type ParsedEmail = {
  adapter: Adapter;
  eventId: string | null;
  messageId: string;
  fromEmail: string;
  fromName: string | null;
  recipients: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  raw: Record<string, unknown>;
  attachments: ParsedAttachment[];
};

export type EmailSource = {
  id: string;
  tenant_id: string;
  provider_id: string | null;
  address: string;
  allowed_senders: string[];
  settings: Record<string, unknown>;
};

export type Provider = {
  id: string;
  name: string;
  email_domains: string[];
};

export const DOCUMENT_BUCKET = "documents";
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const SUPPORTED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/html",
  "text/plain",
]);

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function parseAddress(value: string | null | undefined) {
  const input = (value ?? "").trim();
  const match = input.match(/^(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>$/);
  if (match) {
    return {
      name: match[1]?.trim() || null,
      email: normalizeEmail(match[2]),
    };
  }
  const emailMatch = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return {
    name: null,
    email: normalizeEmail(emailMatch?.[0] ?? input),
  };
}

export function domainOf(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function recipientList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => (typeof item === "string" ? item.split(",") : []))
      .map((item) => parseAddress(item).email)
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => parseAddress(item).email)
      .filter(Boolean);
  }
  return [];
}

export function extensionForMime(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "text/html") return "html";
  if (mimeType === "text/plain") return "txt";
  if (mimeType === "message/rfc822") return "eml";
  return "bin";
}

export function isSupportedDocument(mimeType: string, filename: string) {
  const normalized = mimeType.toLowerCase();
  if (SUPPORTED_DOCUMENT_TYPES.has(normalized)) return true;
  return /\.(pdf|jpe?g|png|webp|html?|txt)$/i.test(filename);
}

export function mimeFromFilename(filename: string, fallback: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".txt")) return "text/plain";
  return fallback || "application/octet-stream";
}

export async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function senderAllowed(source: EmailSource, senderEmail: string) {
  if (!source.allowed_senders?.length) return true;
  const sender = normalizeEmail(senderEmail);
  const senderDomain = domainOf(sender);
  return source.allowed_senders.some((rule) => {
    const normalized = normalizeEmail(rule);
    if (normalized === sender) return true;
    if (normalized.startsWith("*@")) return senderDomain === normalized.slice(2);
    if (!normalized.includes("@")) return senderDomain === normalized;
    return false;
  });
}

export async function detectProvider(
  supabase: ReturnType<typeof createServiceClient>,
  source: EmailSource,
  parsed: ParsedEmail,
) {
  if (source.provider_id)
    return { providerId: source.provider_id, reason: "source", confidence: 1 };

  const senderDomain = domainOf(parsed.fromEmail);
  const { data: providers } = await supabase
    .from("providers")
    .select("id, name, email_domains")
    .eq("tenant_id", source.tenant_id)
    .eq("status", "active");

  const byDomain = ((providers ?? []) as Provider[]).find((provider) =>
    provider.email_domains?.map((domain) => domain.toLowerCase()).includes(senderDomain),
  );
  if (byDomain) return { providerId: byDomain.id, reason: "sender_domain", confidence: 0.86 };

  const { data: rules } = await supabase
    .from("provider_detection_rules")
    .select("provider_id, rule_type, pattern, priority")
    .eq("tenant_id", source.tenant_id)
    .eq("active", true)
    .in("rule_type", ["sender_email", "email_domain", "subject_contains", "filename_contains"])
    .order("priority", { ascending: false });

  const haystack = {
    sender_email: parsed.fromEmail,
    email_domain: senderDomain,
    subject_contains: parsed.subject ?? "",
    filename_contains: parsed.attachments.map((attachment) => attachment.filename).join(" "),
  };

  for (const rule of (rules ?? []) as Array<{
    provider_id: string;
    rule_type: keyof typeof haystack;
    pattern: string;
  }>) {
    const value = haystack[rule.rule_type]?.toLowerCase() ?? "";
    if (value.includes(rule.pattern.toLowerCase())) {
      return { providerId: rule.provider_id, reason: rule.rule_type, confidence: 0.78 };
    }
  }

  return { providerId: null, reason: "unknown", confidence: 0 };
}

async function uploadText(
  supabase: ReturnType<typeof createServiceClient>,
  path: string,
  content: string,
  contentType: string,
) {
  const { error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(path, content, { contentType, upsert: false });
  if (error) throw error;
}

async function fetchAttachmentBytes(attachment: ParsedAttachment): Promise<ArrayBuffer | null> {
  if (attachment.bytes) return attachment.bytes;
  if (!attachment.downloadUrl) return null;
  const response = await fetch(attachment.downloadUrl);
  if (!response.ok) throw new Error(`attachment_download_failed:${response.status}`);
  return response.arrayBuffer();
}

function invokeIngest(documentId: string, tenantId: string) {
  // Fire-and-forget: disparar la llamada y regresar INMEDIATAMENTE.
  // No await — el email-ingest no debe bloquear esperando que el AI pipeline
  // complete (puede tardar decenas de segundos y causar timeout de 504).
  // EdgeRuntime.waitUntil() asegura que la promesa termine aunque el handler
  // principal ya haya retornado su respuesta HTTP.
  // Si falla, el documento queda en "uploaded" y el janitor lo reintenta a los 5 min.
  const promise = fetch(`${secrets.supabaseUrl}/functions/v1/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secrets.supabaseServiceKey}`,
    },
    body: JSON.stringify({ document_id: documentId, tenant_id: tenantId }),
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[email-pipeline] ingest failed for ${documentId}: ${res.status} ${body.slice(0, 200)}`,
      );
    }
  }).catch((err) => {
    console.error(
      `[email-pipeline] ingest error for ${documentId}:`,
      err instanceof Error ? err.message : err,
    );
  });

  try {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(promise);
  } catch {
    // fuera de edge runtime (tests): ignorar
  }
}

// Read the source's allowed MIME types config. Returns null when no list
// is configured → permissive legacy behavior (accepts all supported types).
function getAllowedMimeTypes(source: EmailSource): string[] {
  const v = source.settings?.allowed_mime_types;
  if (!Array.isArray(v) || v.length === 0) return ["application/pdf"];
  const list = v.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
  return list.length > 0 ? list : ["application/pdf"];
}

// ── Per-source packing slip detection ─────────────────────────────────────
// Si el source tiene packing_slip_filename_patterns, detecta adjuntos que
// sean packing slips por nombre de archivo (insensible a mayúsculas/símbolos).
// Estos documentos se guardan pero NO disparan el AI pipeline — se adjuntan
// al SO de Odoo directamente desde odoo-export.

function getPackingSlipPatterns(source: EmailSource): string[] {
  const v = source.settings?.packing_slip_filename_patterns;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function isPackingSlipAttachment(filename: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const normalized = filename.toLowerCase().replace(/[^a-z0-9]/g, "");
  return patterns.some((p) => normalized.includes(p.toLowerCase().replace(/[^a-z0-9]/g, "")));
}

// Si el source tiene process_html_body:true, el cuerpo HTML del email se
// guarda como documento (text/html) aunque ya existan adjuntos PDF válidos.
// Activar solo en sources configurados explícitamente (no para todos).
function shouldProcessHtmlBody(source: EmailSource): boolean {
  return source.settings?.process_html_body === true;
}

async function storeAttachment(
  supabase: ReturnType<typeof createServiceClient>,
  source: EmailSource,
  inboundEmailId: string,
  providerId: string | null,
  basePath: string,
  attachment: ParsedAttachment,
  parsed: ParsedEmail,
  packingSlipPatterns: string[] = [],
): Promise<{ documentId: string | null }> {
  const mimeType = mimeFromFilename(attachment.filename, attachment.contentType);
  const supported = isSupportedDocument(mimeType, attachment.filename);
  const bytes = await fetchAttachmentBytes(attachment);
  const sizeBytes = bytes?.byteLength ?? attachment.size ?? 0;
  const attachmentId = crypto.randomUUID();
  const storagePath = `${basePath}/attachments/${attachmentId}.${extensionForMime(mimeType)}`;

  // Skip inline attachments (typically email signatures and embedded images
  // like Outlook's auto-attached "Outlook-XXX.png"). We still record the row
  // for audit but don't create a document or trigger the AI pipeline.
  const isInline = attachment.disposition === "inline";
  if (isInline) {
    const { error } = await supabase.from("inbound_email_attachments").insert({
      id: attachmentId,
      tenant_id: source.tenant_id,
      inbound_email_id: inboundEmailId,
      storage_path: storagePath,
      original_name: attachment.filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      disposition: attachment.disposition,
      state: "skipped_inline",
      meta: { content_id: attachment.contentId, external_id: attachment.externalId },
    });
    if (error) throw error;
    return { documentId: null };
  }

  // ── Per-source MIME allowlist ─────────────────────────────────────────────
  // Only types in the allowlist pass through. Default (unconfigured sources)
  // is ["application/pdf"] — prevents .txt/.png/.html from burning AI tokens.
  const allowList = getAllowedMimeTypes(source);
  if (!allowList.includes(mimeType.toLowerCase())) {
    const { error } = await supabase.from("inbound_email_attachments").insert({
      id: attachmentId,
      tenant_id: source.tenant_id,
      inbound_email_id: inboundEmailId,
      storage_path: storagePath,
      original_name: attachment.filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      disposition: attachment.disposition,
      state: "filtered_mime_type",
      meta: {
        content_id: attachment.contentId,
        external_id: attachment.externalId,
        reason: `mime ${mimeType} not in allow list`,
        allow_list: allowList,
      },
    });
    if (error) throw error;
    return { documentId: null };
  }

  if (!supported || !bytes || sizeBytes <= 0 || sizeBytes > MAX_DOCUMENT_BYTES) {
    const { error } = await supabase.from("inbound_email_attachments").insert({
      id: attachmentId,
      tenant_id: source.tenant_id,
      inbound_email_id: inboundEmailId,
      storage_path: storagePath,
      original_name: attachment.filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      disposition: attachment.disposition,
      state: "unsupported",
      meta: { content_id: attachment.contentId, external_id: attachment.externalId },
    });
    if (error) throw error;
    return { documentId: null };
  }

  // ── Packing slip detection ────────────────────────────────────────────────
  // Si el nombre del adjunto coincide con los patrones del source, se guarda
  // en Storage + DB pero NO se dispara el AI pipeline (invokeIngest).
  // odoo-export lo adjuntará a csf_packing_list_attachment_id del SO.
  // packingSlipPatterns viene del provider config (resuelto en persistInboundEmail)
  const isPacking = isPackingSlipAttachment(attachment.filename, packingSlipPatterns);

  const { error: storageError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (storageError) throw storageError;

  // IMPORTANTE: documentId y storagePath deben estar sincronizados.
  // Usamos attachmentId como base del nombre del archivo en storage,
  // y documentId es independiente. El documento apunta a storagePath
  // que usa attachmentId — NO cambiar el orden de estas declaraciones.
  const documentId = crypto.randomUUID();
  // Verificar que storagePath no fue modificado (sanity check)
  const expectedPath = `${basePath}/attachments/${attachmentId}.${extensionForMime(mimeType)}`;
  const finalStoragePath = expectedPath; // usar siempre el path calculado desde attachmentId
  const checksum = await sha256Hex(bytes);
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      id: documentId,
      tenant_id: source.tenant_id,
      original_name: attachment.filename,
      storage_path: finalStoragePath, // siempre el path basado en attachmentId
      mime_type: mimeType,
      size_bytes: sizeBytes,
      // Packing slips se almacenan en estado "uploaded" pero no entran al
      // pipeline de AI. odoo-export los recoge y adjunta directamente al SO.
      // Packing slips: "reviewed" = no pasa por AI. Los demás: "uploaded" → pipeline.
      state: isPacking ? "reviewed" : "uploaded",
      provider_id: providerId,
      source_channel: "email",
      source_ref: inboundEmailId,
      source_meta: {
        inbound_email_id: inboundEmailId,
        adapter: parsed.adapter,
        message_id: parsed.messageId,
        from_email: parsed.fromEmail,
        attachment_id: attachmentId,
        checksum,
        // Flag para que odoo-export lo detecte y adjunte a csf_packing_list_attachment_id
        is_packing_slip: isPacking,
      },
    })
    .select("id")
    .single();
  if (documentError || !document) throw documentError ?? new Error("document_insert_failed");

  const { error: attachmentError } = await supabase.from("inbound_email_attachments").insert({
    id: attachmentId,
    tenant_id: source.tenant_id,
    inbound_email_id: inboundEmailId,
    document_id: documentId,
    storage_path: storagePath,
    original_name: attachment.filename,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    disposition: attachment.disposition,
    state: "document_created",
    sha256: checksum,
    meta: {
      content_id: attachment.contentId,
      external_id: attachment.externalId,
      is_packing_slip: isPacking,
    },
  });
  if (attachmentError) throw attachmentError;

  // Packing slips: guardar sin AI. El export a Odoo los adjunta al SO.
  if (!isPacking) {
    await invokeIngest(documentId, source.tenant_id);
  }

  return { documentId };
}

async function createBodyDocument(
  supabase: ReturnType<typeof createServiceClient>,
  source: EmailSource,
  inboundEmailId: string,
  providerId: string | null,
  basePath: string,
  parsed: ParsedEmail,
  bypassAllowList = false, // true cuando process_html_body está activo en el provider
): Promise<string | null> {
  const content = parsed.html ?? parsed.text;
  if (!content) return null;
  const mimeType = parsed.html ? "text/html" : "text/plain";

  // Respect the source's MIME allowlist — body-document fallback should not
  // sneak past the filter. Si text/html o text/plain no están en la lista,
  // no crear el doc. EXCEPTO cuando el provider tiene process_html_body:true —
  // en ese caso el cuerpo HTML ES el documento principal (e.g. Global Industrial).
  if (!bypassAllowList) {
    const allowList = getAllowedMimeTypes(source);
    if (!allowList.includes(mimeType.toLowerCase())) {
      return null;
    }
  }
  const documentId = crypto.randomUUID();
  const storagePath = `${basePath}/body-document.${extensionForMime(mimeType)}`;
  const bytes = new TextEncoder().encode(content).buffer;
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) return null;

  const { error: storageError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (storageError) throw storageError;

  const { error: documentError } = await supabase.from("documents").insert({
    id: documentId,
    tenant_id: source.tenant_id,
    original_name: parsed.subject
      ? `${parsed.subject}.${extensionForMime(mimeType)}`
      : `email-body.${extensionForMime(mimeType)}`,
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: bytes.byteLength,
    state: "uploaded",
    provider_id: providerId,
    source_channel: "email",
    source_ref: inboundEmailId,
    source_meta: {
      inbound_email_id: inboundEmailId,
      adapter: parsed.adapter,
      message_id: parsed.messageId,
      from_email: parsed.fromEmail,
      body_document: true,
    },
  });
  if (documentError) throw documentError;

  await invokeIngest(documentId, source.tenant_id);
  return documentId;
}

// ── Cleo WebEDI notification detection & dispatch ──────────────────────────
// Cleo sends a notification email with a metadata table. The "Message" column
// in that table is the Cleo internal message ID we need to download the actual
// PO PDF from the portal. We detect, parse, and dispatch a job to the Vercel
// runner; we do NOT create body-document(s) for these notifications since the
// real data lives behind the portal, not in the email.

type CleoRow = {
  document: string;
  reference: string;
  messageId: string;
  batchId: string;
  date: string;
  time: string;
};

const CLEO_TABLE_HEADERS = [
  "Date",
  "Time",
  "Document",
  "Interchange",
  "Control",
  "Reference",
  "Message",
  "Batch Id",
];

function isCleoNotification(html: string | null): boolean {
  if (!html) return false;
  // Must contain ALL Cleo-specific headers in the same table
  for (const h of CLEO_TABLE_HEADERS) {
    if (!html.includes(`<th>${h}</th>`)) return false;
  }
  return true;
}

function parseCleoTable(html: string): CleoRow[] {
  // Extract the data table — the one containing the Cleo headers
  const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) ?? [];
  const dataTable = tables.find((t) => t.includes("<th>Message</th>"));
  if (!dataTable) return [];

  // Drop header row, parse data rows
  const rows = dataTable.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const out: CleoRow[] = [];
  for (const row of rows) {
    if (row.includes("<th>")) continue; // skip header row
    const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) =>
      m[1].replace(/<[^>]+>/g, "").trim(),
    );
    // Expected order: Date, Time, Document, Interchange, Control, Reference, Message, Batch Id
    if (cells.length < 8) continue;
    out.push({
      date: cells[0],
      time: cells[1],
      document: cells[2],
      reference: cells[5],
      messageId: cells[6],
      batchId: cells[7],
    });
  }
  return out;
}

function tradingPartnerFromSubject(subject: string | null): string | null {
  if (!subject) return null;
  // "FW: Arrival of data from Walmart / Sams Club-850" → "Walmart / Sams Club"
  // "Arrival of data from Zoro-850" → "Zoro"
  const m = subject.match(/Arrival of data from\s+(.+?)\s*-\s*\d+\s*$/i);
  return m?.[1]?.trim() ?? null;
}

async function dispatchCleoJob(payload: {
  tenant_id: string;
  inbound_email_id: string;
  cleo_message_id: string;
  cleo_reference: string;
  cleo_batch_id: string;
  trading_partner: string | null;
  subject: string | null;
  from_email: string;
}) {
  const baseUrl = Deno.env.get("INTAKE_PUBLIC_APP_URL");
  const internalToken = Deno.env.get("INTAKE_CLEO_INTERNAL_TOKEN");
  if (!baseUrl || !internalToken) {
    // No app URL configured — we still want to record the inbound email,
    // just skip the dispatch. The user can re-trigger manually later.
    return { ok: false, reason: "cleo_dispatch_not_configured" };
  }
  try {
    const response = await fetch(`${baseUrl}/api/ingest/cleo/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cleo-internal-token": internalToken,
      },
      body: JSON.stringify(payload),
      // Fire-and-forget: don't wait for the long-running Playwright flow.
      // The runner is asynchronous on its end; we just need the dispatch.
      signal: AbortSignal.timeout(8000),
    });
    return { ok: response.ok, reason: response.ok ? "dispatched" : `http_${response.status}` };
  } catch (err) {
    // Timeout or connection error is OK — the runner may still be processing.
    // It's idempotent on cleo_message_id, so a retry later is safe.
    return { ok: true, reason: err instanceof Error ? err.message : "fetch_error" };
  }
}

// ── Rithum (CommerceHub OrderStream) notification detection & dispatch ────
// Rithum sends "Rithum New Order Alert" emails from noreply@rithum.com with
// a small HTML table (PO Number / Merchant Name / Order Date) listing up to
// 10 new orders. We detect, parse, and dispatch one job per row to the
// Vercel runner. The runner navigates the dashboard to the order detail and
// renders it to PDF (Rithum has no native PDF download). Mirror of the
// Cleo flow above; Rithum is fully isolated in `rithum_*` namespaces.

type RithumRow = {
  poNumber: string;
  merchantName: string;
  orderDate: string; // raw MM/DD/YYYY as it appears in the email
};

type RithumPartnerPid = "thehomedepot" | "walmartmp" | "thdso";

const RITHUM_TABLE_HEADERS = ["PO Number", "Merchant Name", "Order Date"];
const RITHUM_LOGIN_URL = "dsm.commercehub.com/dsm/gotoLogin.do";

function isRithumNotification(
  html: string | null,
  fromEmail: string,
  subject: string | null,
): boolean {
  // Sender check (primary signal): noreply@rithum.com is the production
  // sender. Legacy commercehub.com is accepted in case any old emails arrive.
  const sender = (fromEmail ?? "").toLowerCase();
  const senderMatch =
    sender.includes("rithum.com") || sender.includes("commercehub.com");

  // Subject check: varios formatos conocidos de Rithum.
  // "Rithum New Order Alert" — formato estándar
  // "N orders require your attention" — formato alternativo de Rithum
  const subjectMatch =
    /rithum\s+new\s+order\s+alert/i.test(subject ?? "") ||
    /orders?\s+require\s+your\s+attention/i.test(subject ?? "") ||
    /new\s+orders?\s+ready\s+for\s+processing/i.test(subject ?? "");

  // HTML signature: the column headers + the login URL.
  // Only evaluated when html is available — sender+subject alone are sufficient
  // for ≥2 signals (M365/Graph may deliver body as null on some notifications).
  let tableMatch = false;
  if (html) {
    let headersMatch = true;
    for (const h of RITHUM_TABLE_HEADERS) {
      if (!html.includes(h)) {
        headersMatch = false;
        break;
      }
    }
    tableMatch = headersMatch && html.includes(RITHUM_LOGIN_URL);
  }

  // Robust to forwards that strip headers: require ≥2 of 3 signals.
  const matches = [senderMatch, subjectMatch, tableMatch].filter(Boolean).length;
  return matches >= 2;
}

function parseRithumTable(html: string | null): RithumRow[] {
  if (!html) return [];
  // The order list is the only <table> with border="1" containing "PO Number"
  // in a <th>. The other tables in the email are layout wrappers.
  const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) ?? [];
  const dataTable = tables.find(
    (t) => t.includes("PO Number") && t.includes("Merchant Name"),
  );
  if (!dataTable) return [];

  const rows = dataTable.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const out: RithumRow[] = [];
  for (const row of rows) {
    if (row.includes("<th")) continue; // skip header row
    const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) =>
      m[1].replace(/<[^>]+>/g, "").trim(),
    );
    if (cells.length < 3) continue;
    const [poNumber, merchantName, orderDate] = cells;
    if (!poNumber || !merchantName) continue;
    out.push({ poNumber, merchantName, orderDate });
  }
  return out;
}

function rithumPartnerPid(merchantName: string): RithumPartnerPid | null {
  const m = merchantName.toLowerCase().trim();
  if (m.includes("home depot special")) return "thdso";
  if (m.includes("home depot")) return "thehomedepot";
  if (m.includes("walmart")) return "walmartmp";
  return null;
}

function rithumDateToIso(raw: string): string | null {
  // Email gives MM/DD/YYYY → store as ISO YYYY-MM-DD when possible.
  const m = (raw ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

async function dispatchRithumJob(payload: {
  tenant_id: string;
  inbound_email_id: string;
  rithum_order_number: string;
  rithum_partner: string;
  rithum_partner_pid: RithumPartnerPid | null;
  rithum_order_date: string | null;
  subject: string | null;
  from_email: string;
}) {
  const baseUrl = Deno.env.get("INTAKE_PUBLIC_APP_URL");
  const internalToken = Deno.env.get("INTAKE_RITHUM_INTERNAL_TOKEN");
  if (!baseUrl || !internalToken) {
    return { ok: false, reason: "rithum_dispatch_not_configured" };
  }
  try {
    const response = await fetch(`${baseUrl}/api/ingest/rithum/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rithum-internal-token": internalToken,
      },
      body: JSON.stringify(payload),
      // Fire-and-forget: the runner is asynchronous (Playwright); we just
      // need the dispatch to land. Idempotent on rithum_order_number.
      signal: AbortSignal.timeout(8000),
    });
    return { ok: response.ok, reason: response.ok ? "dispatched" : `http_${response.status}` };
  } catch (err) {
    // Treat timeouts as success — the runner started and is processing.
    return { ok: true, reason: err instanceof Error ? err.message : "fetch_error" };
  }
}

export type PersistResult =
  | {
      duplicate: true;
      inboundEmailId: string;
      documentIds: string[];
    }
  | {
      duplicate: false;
      inboundEmailId: string;
      documentIds: string[];
      providerDetection: { providerId: string | null; reason: string; confidence: number };
    };

/**
 * Persist a parsed email end-to-end:
 * - dedupe by (tenant_id, message_id)
 * - upload raw payload + body parts to storage
 * - insert inbound_emails row
 * - persist each attachment as a document and trigger AI ingest
 * - if no usable attachment, fall back to a body-document so the email still hits the pipeline
 */
export async function persistInboundEmail(
  supabase: ReturnType<typeof createServiceClient>,
  source: EmailSource,
  parsed: ParsedEmail,
): Promise<PersistResult> {
  const { data: existing } = await supabase
    .from("inbound_emails")
    .select("id")
    .eq("tenant_id", source.tenant_id)
    .eq("message_id", parsed.messageId)
    .maybeSingle();

  if (existing?.id) {
    return { duplicate: true, inboundEmailId: existing.id, documentIds: [] };
  }

  const providerDetection = await detectProvider(supabase, source, parsed);

  // ── Cargar configuración de ingest específica del provider ─────────────
  // Los providers pueden tener en settings.email_ingest reglas especiales:
  //   process_html_body: true  → el cuerpo HTML se procesa como documento
  //   packing_slip_filename_patterns: string[]  → adjuntos que son packing slips
  // Esto permite configurar comportamiento por proveedor sin tocar el source.
  type ProviderEmailIngestConfig = {
    process_html_body?: boolean;
    packing_slip_filename_patterns?: string[];
  };
  let providerEmailConfig: ProviderEmailIngestConfig = {};
  if (providerDetection.providerId) {
    try {
      const { data: provRow } = await supabase
        .from("providers")
        .select("settings")
        .eq("id", providerDetection.providerId)
        .maybeSingle();
      const cfg = (provRow?.settings as Record<string, unknown> | null)?.email_ingest;
      if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
        providerEmailConfig = cfg as ProviderEmailIngestConfig;
      }
    } catch {
      // Non-fatal: si falla, usar config vacía (comportamiento estándar)
    }
  }

  // Resolver config efectiva: provider settings > source settings > defaults
  const effectiveProcessHtmlBody =
    providerEmailConfig.process_html_body ?? shouldProcessHtmlBody(source);
  const effectivePackingSlipPatterns =
    (providerEmailConfig.packing_slip_filename_patterns ?? []).length > 0
      ? (providerEmailConfig.packing_slip_filename_patterns ?? [])
      : getPackingSlipPatterns(source);

  const emailId = crypto.randomUUID();
  const basePath = `${source.tenant_id}/email/${new Date().toISOString().slice(0, 7)}/${emailId}`;
  const rawPath = `${basePath}/raw.json`;
  const htmlPath = parsed.html ? `${basePath}/body.html` : null;
  const textPath = parsed.text ? `${basePath}/body.txt` : null;

  // Usar text/plain para el raw snapshot — application/json no está en la
  // allowlist del bucket de Storage y causaba "mime type not supported".
  await uploadText(supabase, rawPath, JSON.stringify(parsed.raw, null, 2), "text/plain");
  if (parsed.html && htmlPath) await uploadText(supabase, htmlPath, parsed.html, "text/html");
  if (parsed.text && textPath) await uploadText(supabase, textPath, parsed.text, "text/plain");

  const { data: inboundEmail, error: inboundError } = await supabase
    .from("inbound_emails")
    .insert({
      id: emailId,
      tenant_id: source.tenant_id,
      ingest_source_id: source.id,
      provider_id: providerDetection.providerId,
      message_id: parsed.messageId,
      from_email: parsed.fromEmail,
      from_name: parsed.fromName,
      subject: parsed.subject,
      raw_storage_path: rawPath,
      html_storage_path: htmlPath,
      text_storage_path: textPath,
      state: "processing",
      meta: {
        adapter: parsed.adapter,
        event_id: parsed.eventId,
        recipients: parsed.recipients,
        provider_detection: providerDetection,
      },
    })
    .select("id")
    .single();

  if (inboundError || !inboundEmail) throw inboundError ?? new Error("inbound_email_insert_failed");

  // ── Cleo WebEDI notification → dispatch jobs, do NOT create body documents
  if (isCleoNotification(parsed.html)) {
    const rows = parseCleoTable(parsed.html!);
    const tradingPartner = tradingPartnerFromSubject(parsed.subject);
    const dispatched: Array<{ message_id: string; reference: string; ok: boolean; reason: string }> = [];
    let dispatchedCount = 0;
    for (const row of rows) {
      // ONLY process 850 (Purchase Orders). Skip everything else (855, 856, 997, etc.)
      if (row.document !== "850") continue;
      if (!row.messageId) continue;
      const result = await dispatchCleoJob({
        tenant_id: source.tenant_id,
        inbound_email_id: inboundEmail.id,
        cleo_message_id: row.messageId,
        cleo_reference: row.reference,
        cleo_batch_id: row.batchId,
        trading_partner: tradingPartner,
        subject: parsed.subject,
        from_email: parsed.fromEmail,
      });
      dispatched.push({
        message_id: row.messageId,
        reference: row.reference,
        ok: result.ok,
        reason: result.reason,
      });
      if (result.ok) dispatchedCount += 1;
    }

    await supabase
      .from("inbound_emails")
      .update({
        state: dispatchedCount > 0 ? "processed" : "ignored",
        meta: {
          adapter: parsed.adapter,
          event_id: parsed.eventId,
          recipients: parsed.recipients,
          provider_detection: providerDetection,
          cleo_notification: true,
          cleo_trading_partner: tradingPartner,
          cleo_rows: rows,
          cleo_dispatched: dispatched,
        },
      })
      .eq("id", inboundEmail.id)
      .eq("tenant_id", source.tenant_id);

    // Documents are created asynchronously by the Cleo runner — return empty
    // for now. They'll appear in the inbox once Playwright finishes downloading.
    return {
      duplicate: false,
      inboundEmailId: inboundEmail.id,
      documentIds: [],
      providerDetection,
    };
  }

  // ── Rithum (CommerceHub) notification → dispatch jobs, do NOT create body documents
  if (isRithumNotification(parsed.html, parsed.fromEmail, parsed.subject)) {
    const rows = parseRithumTable(parsed.html);
    const dispatched: Array<{ po_number: string; partner: string; ok: boolean; reason: string }> = [];
    let dispatchedCount = 0;
    for (const row of rows) {
      if (!row.poNumber) continue;
      // Walmart Marketplace deshabilitado — precios vacíos en líneas.
      // Se conectará vía plugin separado a Walmart Seller Central.
      if (rithumPartnerPid(row.merchantName) === "walmartmp") continue;
      const result = await dispatchRithumJob({
        tenant_id: source.tenant_id,
        inbound_email_id: inboundEmail.id,
        rithum_order_number: row.poNumber,
        rithum_partner: row.merchantName,
        rithum_partner_pid: rithumPartnerPid(row.merchantName),
        rithum_order_date: rithumDateToIso(row.orderDate),
        subject: parsed.subject,
        from_email: parsed.fromEmail,
      });
      dispatched.push({
        po_number: row.poNumber,
        partner: row.merchantName,
        ok: result.ok,
        reason: result.reason,
      });
      if (result.ok) dispatchedCount += 1;
    }

    await supabase
      .from("inbound_emails")
      .update({
        state: dispatchedCount > 0 ? "processed" : "ignored",
        meta: {
          adapter: parsed.adapter,
          event_id: parsed.eventId,
          recipients: parsed.recipients,
          provider_detection: providerDetection,
          rithum_notification: true,
          rithum_rows: rows,
          rithum_dispatched: dispatched,
        },
      })
      .eq("id", inboundEmail.id)
      .eq("tenant_id", source.tenant_id);

    return {
      duplicate: false,
      inboundEmailId: inboundEmail.id,
      documentIds: [],
      providerDetection,
    };
  }

  const documentIds: string[] = [];
  for (const attachment of parsed.attachments) {
    const result = await storeAttachment(
      supabase,
      source,
      inboundEmail.id,
      providerDetection.providerId,
      basePath,
      attachment,
      parsed,
      effectivePackingSlipPatterns,
    );
    // Los packing slips NO se cuentan como documentIds principales —
    // solo los documentos que van al pipeline de AI y crean order_drafts.
    const isPacking = isPackingSlipAttachment(attachment.filename, effectivePackingSlipPatterns);
    if (result.documentId && !isPacking) documentIds.push(result.documentId);
  }

  // Caso estándar: crear body document solo cuando NO hay adjuntos válidos.
  // Caso process_html_body:true (Global Industrial y similares): crear el
  // body document SIEMPRE que haya HTML, aunque ya existan adjuntos PDF.
  // Esto permite que el cuerpo del email (la PO en HTML) entre al pipeline
  // de AI como un documento separado de los adjuntos.
  const shouldCreateBody = effectiveProcessHtmlBody
    ? Boolean(parsed.html || parsed.text)
    : documentIds.length === 0 && Boolean(parsed.html || parsed.text);

  if (shouldCreateBody) {
    const bodyId = await createBodyDocument(
      supabase,
      source,
      inboundEmail.id,
      providerDetection.providerId,
      basePath,
      parsed,
      effectiveProcessHtmlBody, // bypass allowlist cuando el provider lo requiere
    );
    if (bodyId) documentIds.push(bodyId);
  }

  await supabase
    .from("inbound_emails")
    .update({ state: documentIds.length > 0 ? "processed" : "ignored" })
    .eq("id", inboundEmail.id)
    .eq("tenant_id", source.tenant_id);

  return {
    duplicate: false,
    inboundEmailId: inboundEmail.id,
    documentIds,
    providerDetection,
  };
}

export async function recordEvent(
  supabase: ReturnType<typeof createServiceClient>,
  payload: {
    adapter: Adapter;
    source?: EmailSource;
    inboundEmailId?: string;
    parsed?: ParsedEmail;
    state: "accepted" | "duplicate" | "rejected" | "failed";
    statusCode: number;
    errorCode?: string;
    meta?: Record<string, unknown>;
  },
) {
  await supabase.from("email_ingest_events").insert({
    tenant_id: payload.source?.tenant_id ?? null,
    ingest_source_id: payload.source?.id ?? null,
    inbound_email_id: payload.inboundEmailId ?? null,
    adapter: payload.adapter,
    event_id: payload.parsed?.eventId ?? null,
    state: payload.state,
    status_code: payload.statusCode,
    error_code: payload.errorCode ?? null,
    meta: {
      message_id: payload.parsed?.messageId,
      from_domain: payload.parsed ? domainOf(payload.parsed.fromEmail) : undefined,
      recipient_count: payload.parsed?.recipients.length,
      attachment_count: payload.parsed?.attachments.length,
      ...payload.meta,
    },
  });
}
