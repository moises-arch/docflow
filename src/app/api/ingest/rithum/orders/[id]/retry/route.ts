// Retry a previously failed Rithum order. Re-invokes the Playwright runner
// with the same job payload reconstructed from the rithum_orders row.
import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { runRithumJob } from "@/lib/rithum/runner";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  type RithumOrder = {
    id: string;
    rithum_order_number: string;
    rithum_partner: string | null;
    inbound_email_id: string | null;
    state: string;
  };

  const { data, error } = await db
    .from<RithumOrder>("rithum_orders")
    .select("id, rithum_order_number, rithum_partner, inbound_email_id, state")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  const order = Array.isArray(data) ? data[0] : (data as RithumOrder | null);
  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  await db
    .from("rithum_orders")
    .update({ state: "pending", last_error: null })
    .eq("id", order.id);

  // Resolve PID heuristically from the partner name.
  const partnerLower = (order.rithum_partner ?? "").toLowerCase();
  const partnerPid = partnerLower.includes("home depot special")
    ? "thdso"
    : partnerLower.includes("home depot")
      ? "thehomedepot"
      : partnerLower.includes("walmart")
        ? "walmartmp"
        : null;

  const result = await runRithumJob({
    tenant_id: tenantId,
    inbound_email_id: order.inbound_email_id,
    rithum_order_number: order.rithum_order_number,
    rithum_partner: order.rithum_partner ?? "",
    rithum_partner_pid: partnerPid,
    rithum_order_date: null,
    subject: null,
    from_email: "",
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
