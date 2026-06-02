// Re-apply the Rithum parsed_payload to the order_draft. Idempotent —
// useful when the AI overwrote a clean parse. Mirror of the Cleo route.
import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { applyParsedToDraft } from "@/lib/rithum/apply-parsed";
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

  const { data, error } = await db
    .from<Row>("rithum_orders")
    .select("id, document_id, parsed_payload")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  const row = Array.isArray(data) ? data[0] : (data as Row | null);
  if (error || !row) {
    return NextResponse.json({ error: "rithum_order not found" }, { status: 404 });
  }
  if (!row.document_id) {
    return NextResponse.json({ error: "rithum_order has no document_id" }, { status: 422 });
  }
  if (!row.parsed_payload) {
    return NextResponse.json(
      { error: "no parsed_payload — re-download required to capture HTML" },
      { status: 422 },
    );
  }

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
    row.parsed_payload as unknown as import("@/lib/rithum/parse-html").RithumParsed,
  );

  return NextResponse.json(result);
}
