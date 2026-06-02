// Performance scorecard endpoint — reads from walmart_performance_snapshots.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  type Row = {
    on_time_delivery_rate: number | null;
    valid_tracking_rate: number | null;
    seller_response_rate: number | null;
    refund_rate: number | null;
    cancellation_rate: number | null;
    taken_at: string;
  };

  const { data: snapshots } = await supabase
    .from("walmart_performance_snapshots")
    .select(
      "on_time_delivery_rate, valid_tracking_rate, seller_response_rate, refund_rate, cancellation_rate, taken_at",
    )
    .eq("tenant_id", tenantId)
    .order("taken_at", { ascending: false })
    .limit(90);

  const list = (snapshots ?? []) as Row[];
  const latest = list[0] ?? null;

  return NextResponse.json({
    latest,
    trend_30d: list.slice(0, 30).reverse(),
    trend_90d: list.slice().reverse(),
    last_updated: latest?.taken_at ?? null,
  });
}
