import { cleanOptionalText, cleanText, getTenantContext } from "@/app/api/settings/providers/_lib";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

const ADAPTERS = new Set(["mailgun", "microsoft_graph", "generic", "resend", "sendgrid", "imap"]);

// MIME types we accept on email attachments. Anything outside this set is
// rejected even if the user includes it (defense-in-depth).
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "text/html",
  "text/plain",
  // Spreadsheet / table formats
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel",                                           // .xls
  "text/csv",                                                            // .csv
  "application/vnd.oasis.opendocument.spreadsheet",                     // .ods
]);

// Default for new sources — only PDFs pass through. Cuts AI costs by
// blocking signature noise (.txt, inline .png, etc).
const DEFAULT_ALLOWED_MIME_TYPES = ["application/pdf"];

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function parseAllowedSenders(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item).toLowerCase()).filter(Boolean);
  }
  return cleanText(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseAllowedMimeTypes(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const cleaned = list
    .map((item) => String(item).trim().toLowerCase())
    .filter((item) => item.length > 0 && SUPPORTED_MIME_TYPES.has(item));
  return cleaned.length > 0 ? cleaned : null;
}

export async function POST(req: NextRequest) {
  const context = await getTenantContext();
  if ("error" in context) return context.error;
  const { supabase, tenantId } = context;

  let body: {
    address?: unknown;
    provider_id?: unknown;
    allowed_senders?: unknown;
    adapter?: unknown;
    graph_tenant_id?: unknown;
    graph_client_id?: unknown;
    graph_mailbox_id?: unknown;
    graph_folder_id?: unknown;
    imap_host?: unknown;
    imap_port?: unknown;
    imap_secure?: unknown;
    imap_username?: unknown;
    imap_password?: unknown;
    imap_mailbox?: unknown;
    imap_mark_seen?: unknown;
    allowed_mime_types?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = normalizeEmail(cleanText(body.address));
  const providerId = cleanOptionalText(body.provider_id);
  const allowedSenders = parseAllowedSenders(body.allowed_senders);
  const adapter = cleanText(body.adapter) || "mailgun";
  const graphTenantId = cleanOptionalText(body.graph_tenant_id);
  const graphClientId = cleanOptionalText(body.graph_client_id);
  const graphMailboxId = cleanOptionalText(body.graph_mailbox_id) || address;
  const graphFolderId = cleanOptionalText(body.graph_folder_id) || "Inbox";

  if (!address || !address.includes("@")) {
    return NextResponse.json({ error: "Invalid address" }, { status: 422 });
  }
  if (!ADAPTERS.has(adapter)) {
    return NextResponse.json({ error: "Invalid adapter" }, { status: 422 });
  }
  if (adapter === "microsoft_graph" && !graphMailboxId) {
    return NextResponse.json({ error: "Missing Microsoft mailbox" }, { status: 422 });
  }

  // ── IMAP adapter delegates encryption + connection test to an Edge Function
  // because the AES-256-GCM key (INTAKE_SECRETS_KEY) only lives in the Edge
  // runtime, mirroring the save-odoo-connection pattern.
  if (adapter === "imap") {
    const imapHost = cleanText(body.imap_host);
    const imapUsername = cleanText(body.imap_username);
    const imapPassword = typeof body.imap_password === "string" ? body.imap_password : "";
    const imapMailbox = cleanText(body.imap_mailbox) || "INBOX";
    const imapPort = Number.isFinite(Number(body.imap_port)) ? Number(body.imap_port) : 993;
    const imapSecure = body.imap_secure !== false;
    const imapMarkSeen = body.imap_mark_seen !== false;

    if (!imapHost || !imapUsername || !imapPassword) {
      return NextResponse.json({ error: "Missing IMAP credentials" }, { status: 422 });
    }

    const imapAllowedMimeTypes =
      parseAllowedMimeTypes(body.allowed_mime_types) ?? DEFAULT_ALLOWED_MIME_TYPES;

    const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/email-imap-admin`;
    const edgeRes = await fetch(edgeFnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action: "save",
        tenant_id: tenantId,
        address,
        provider_id: providerId,
        allowed_senders: allowedSenders,
        imap_host: imapHost,
        imap_port: imapPort,
        imap_secure: imapSecure,
        imap_username: imapUsername,
        imap_password: imapPassword,
        imap_mailbox: imapMailbox,
        imap_mark_seen: imapMarkSeen,
        allowed_mime_types: imapAllowedMimeTypes,
      }),
    });

    const payload = (await edgeRes.json().catch(() => ({}))) as {
      ok?: boolean;
      source?: unknown;
      error?: string;
      detail?: string;
    };
    if (!edgeRes.ok || !payload.ok) {
      return NextResponse.json(
        { error: payload.error ?? "Save failed", detail: payload.detail },
        { status: edgeRes.status === 200 ? 500 : edgeRes.status },
      );
    }
    return NextResponse.json(payload.source, { status: 201 });
  }

  const allowedMimeTypes =
    parseAllowedMimeTypes(body.allowed_mime_types) ?? DEFAULT_ALLOWED_MIME_TYPES;

  const settings: Record<string, unknown> = {
    adapter,
    webhook_secret: randomBytes(24).toString("base64url"),
    allowed_mime_types: allowedMimeTypes,
  };
  if (adapter === "microsoft_graph") {
    settings.graph_tenant_id = graphTenantId;
    settings.graph_client_id = graphClientId;
    settings.graph_mailbox_id = graphMailboxId;
    settings.graph_folder_id = graphFolderId;
    settings.graph_client_state = randomBytes(24).toString("base64url");
  }

  const { data, error } = await supabase
    .from("email_ingest_sources")
    .insert({
      tenant_id: tenantId,
      provider_id: providerId,
      address,
      allowed_senders: allowedSenders,
      settings,
      status: "active",
    })
    .select("id, tenant_id, provider_id, address, status, allowed_senders, settings")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message ?? "Create failed" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
