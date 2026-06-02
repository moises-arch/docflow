// Lista los últimos N correos inbound del tenant — usado por el drawer
// global del sidebar. Espejo de la query que hace la página /integrations/email-inbound.
import { NextResponse } from "next/server";
import { getTenantContext, type DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

type Row = {
  id: string;
  subject: string | null;
  from_email: string;
  from_name: string | null;
  received_at: string;
  state: string;
  html_storage_path: string | null;
  text_storage_path: string | null;
  meta: Record<string, unknown> | null;
};

export async function GET(req: Request) {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const { data } = await db
    .from<Row>("inbound_emails")
    .select(
      "id, subject, from_email, from_name, received_at, state, html_storage_path, text_storage_path, meta",
    )
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false })
    .limit(limit);

  const items = ((data ?? []) as Row[]).map((r) => {
    const adapter =
      r.meta && typeof (r.meta as Record<string, unknown>).adapter === "string"
        ? ((r.meta as Record<string, unknown>).adapter as string)
        : null;
    return {
      id: r.id,
      subject: r.subject,
      fromEmail: r.from_email,
      fromName: r.from_name,
      receivedAt: r.received_at,
      state: r.state,
      adapter,
      hasHtml: Boolean(r.html_storage_path),
      hasText: Boolean(r.text_storage_path),
    };
  });

  return NextResponse.json({ items });
}
