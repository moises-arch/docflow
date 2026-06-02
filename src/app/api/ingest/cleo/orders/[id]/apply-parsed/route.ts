// Re-apply Cleo's parsed_payload to the order_draft (overwrites lines, fixes
// customer/total). Useful after the AI extraction completed but produced
// garbage on Cleo's complex template. Idempotent.
import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { applyParsedToDraft } from "@/lib/cleo/apply-parsed";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  type Row = {
    id: string;
    document_id: string | null;
    parsed_payload: Record<string, unknown> | null;
  };

  // Look up the cleo_orders row
  const { data, error } = await db
    .from<Row>("cleo_orders")
    .select("id, document_id, parsed_payload")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  const row = Array.isArray(data) ? data[0] : (data as Row | null);
  if (error || !row) {
    return NextResponse.json({ error: "cleo_order not found" }, { status: 404 });
  }
  if (!row.document_id) {
    return NextResponse.json({ error: "cleo_order has no document_id" }, { status: 422 });
  }
  if (!row.parsed_payload) {
    return NextResponse.json(
      { error: "no parsed_payload — re-download required to capture HTML" },
      { status: 422 },
    );
  }

  // Get provider_id from the document
  type DocRow = { provider_id: string | null };
  const docRes = await db
    .from<DocRow>("documents")
    .select("provider_id")
    .eq("id", row.document_id)
    .single();
  const docRow = Array.isArray(docRes.data) ? docRes.data[0] : (docRes.data as DocRow | null);
  const providerId = docRow?.provider_id ?? null;

  const result = await applyParsedToDraft(
    row.document_id,
    tenantId,
    providerId,
    row.parsed_payload as unknown as import("@/lib/cleo/parse-html").CleoParsed,
  );

  return NextResponse.json(result);
}
