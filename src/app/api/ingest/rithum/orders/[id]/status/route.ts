import { getTenantContext, type DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  const { data, error } = await db
    .from("rithum_orders")
    .select("state, document_id, last_error")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  const row = Array.isArray(data) ? data[0] : (data as { state: string; document_id: string | null; last_error: string | null } | null);
  if (error || !row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ state: row.state, document_id: row.document_id, last_error: row.last_error });
}
