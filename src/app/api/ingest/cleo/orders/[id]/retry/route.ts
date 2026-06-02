// Retry a previously failed Cleo order. Re-invokes the Playwright runner with
// the same job payload reconstructed from the cleo_orders row.
import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { runCleoJob } from "@/lib/cleo/runner";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  type CleoOrder = {
    id: string;
    cleo_message_id: string;
    cleo_reference: string | null;
    cleo_batch_id: string | null;
    trading_partner: string | null;
    inbound_email_id: string | null; // nullable — manual/portal-scanner orders
    state: string;
  };

  const { data, error } = await db
    .from<CleoOrder>("cleo_orders")
    .select(
      "id, cleo_message_id, cleo_reference, cleo_batch_id, trading_partner, inbound_email_id, state",
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  const order = Array.isArray(data) ? data[0] : (data as CleoOrder | null);
  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Reset state so the runner reruns even if the row was 'downloaded'
  await db
    .from("cleo_orders")
    .update({ state: "pending", last_error: null })
    .eq("id", order.id);

  const result = await runCleoJob({
    tenant_id: tenantId,
    inbound_email_id: order.inbound_email_id ?? null,
    cleo_message_id: order.cleo_message_id,
    cleo_reference: order.cleo_reference ?? "",
    cleo_batch_id: order.cleo_batch_id ?? "",
    trading_partner: order.trading_partner,
    subject: null,
    from_email: "",
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
