import {
  cleanOptionalText,
  cleanText,
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { NextRequest, NextResponse } from "next/server";

const STATUSES = new Set(["active", "paused", "archived"]);
const ADAPTERS = new Set(["mailgun", "microsoft_graph", "generic", "resend", "sendgrid", "imap"]);
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContext();
  if ("error" in context) return context.error;
  const { supabase, tenantId } = context;

  let body: {
    status?: unknown;
    provider_id?: unknown;
    allowed_senders?: unknown;
    adapter?: unknown;
    allowed_mime_types?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  const status = cleanText(body.status);
  if (status) {
    if (!STATUSES.has(status))
      return NextResponse.json({ error: "Invalid status" }, { status: 422 });
    patch.status = status;
  }
  if ("provider_id" in body) patch.provider_id = cleanOptionalText(body.provider_id);
  if ("allowed_senders" in body) patch.allowed_senders = parseAllowedSenders(body.allowed_senders);

  // Adapter and allowed_mime_types both live inside settings — when either
  // is being updated we have to merge with the existing settings to avoid
  // wiping unrelated keys (graph_*, imap_*, webhook_secret).
  const settingsUpdates: Record<string, unknown> = {};
  if ("adapter" in body) {
    const adapter = cleanText(body.adapter) || "mailgun";
    if (!ADAPTERS.has(adapter))
      return NextResponse.json({ error: "Invalid adapter" }, { status: 422 });
    settingsUpdates.adapter = adapter;
  }
  if ("allowed_mime_types" in body) {
    const list = parseAllowedMimeTypes(body.allowed_mime_types);
    // Empty/invalid list reverts to default of PDF only — never let the user
    // accidentally turn this off and start eating tokens for .txt files.
    settingsUpdates.allowed_mime_types = list ?? ["application/pdf"];
  }
  if (Object.keys(settingsUpdates).length > 0) {
    const { data: existing } = await (supabase as unknown as DynamicSupabaseClient)
      .from<Array<{ settings: Record<string, unknown> | null }>>("email_ingest_sources")
      .select("settings")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();
    const existingSettings = Array.isArray(existing)
      ? existing[0]?.settings
      : (existing as { settings?: Record<string, unknown> | null } | null)?.settings;
    patch.settings = { ...(existingSettings ?? {}), ...settingsUpdates };
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("email_ingest_sources")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, tenant_id, provider_id, address, status, allowed_senders, settings")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message ?? "Update failed" }, { status: 500 });
  }

  return NextResponse.json(data);
}
