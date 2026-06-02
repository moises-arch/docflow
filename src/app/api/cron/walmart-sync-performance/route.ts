// Performance scorecard sync — daily. Inserts a row into
// walmart_performance_snapshots for trend charts.

import { createServiceClient } from "@/lib/supabase/service";
import { getSellerPerformance } from "@/lib/walmart/api/performance";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const correlationId = randomUUID();
  const svc = createServiceClient();
  const { data: tenants } = await svc
    .from("tenants")
    .select("id")
    .limit(1)
    .returns<Array<{ id: string }>>();
  const tenantId = tenants?.[0]?.id;
  if (!tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 422 });
  }

  try {
    const perf = await getSellerPerformance(correlationId);

    await svc.from("walmart_performance_snapshots").insert({
      tenant_id: tenantId,
      on_time_delivery_rate: perf.onTimeDeliveryRate ?? null,
      valid_tracking_rate: perf.validTrackingRate ?? null,
      seller_response_rate: perf.sellerResponseRate ?? null,
      refund_rate: perf.refundRate ?? null,
      cancellation_rate: perf.cancellationRate ?? null,
      raw_data: (perf.raw ?? null) as never,
    });

    return NextResponse.json({ ok: true, perf });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await svc.from("walmart_smoke_runs").insert({
      tenant_id: tenantId,
      ok: false,
      checks: [{ name: "sync_performance", ok: false, detail: reason }],
    });
    return NextResponse.json({ ok: false, reason }, { status: 500 });
  }
}
