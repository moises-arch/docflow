// Returns sync — every 6h. Upserts walmart_returns from Walmart's API.

import { createServiceClient } from "@/lib/supabase/service";
import { getReturns } from "@/lib/walmart/api/returns";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

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
  if (!tenantId) return NextResponse.json({ error: "no_tenant" }, { status: 422 });

  // Fetch returns from last 30 days
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let cursor: string | undefined = undefined;
  let totalUpserted = 0;

  try {
    for (let page = 0; page < 5; page++) {
      const r = await getReturns({
        limit: 100,
        nextCursor: cursor,
        returnCreatedStartDate: startDate,
        correlationId,
      });
      const returns = r.returns ?? [];
      if (returns.length === 0) break;

      const rows = returns.map((rt) => ({
        tenant_id: tenantId,
        return_order_id: rt.returnOrderId,
        customer_order_id: rt.customerOrderId ?? null,
        walmart_po_id: rt.purchaseOrderId ?? null,
        return_status: rt.status ?? null,
        return_reason: rt.reason ?? null,
        refund_amount: rt.refund?.refundedAmount?.amount ?? null,
        refund_status: rt.refund?.refundStatus ?? null,
        return_lines: (rt.returnLines ?? []) as unknown as Record<string, unknown>,
        raw_data: rt as unknown as Record<string, unknown>,
        synced_at: new Date().toISOString(),
      }));

      const { error } = await (
        svc.from("walmart_returns") as unknown as {
          upsert: (
            v: Record<string, unknown>[],
            opts: { onConflict: string },
          ) => Promise<{ error: { message?: string } | null }>;
        }
      ).upsert(rows, { onConflict: "tenant_id,return_order_id" });

      if (!error) totalUpserted += rows.length;
      cursor = r.nextCursor;
      if (!cursor) break;
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await svc.from("walmart_smoke_runs").insert({
      tenant_id: tenantId,
      ok: false,
      checks: [{ name: "sync_returns", ok: false, detail: reason }],
    });
    return NextResponse.json({ ok: false, reason }, { status: 500 });
  }

  await svc.from("walmart_smoke_runs").insert({
    tenant_id: tenantId,
    ok: true,
    checks: [{ name: "sync_returns", ok: true, detail: `upserted=${totalUpserted}` }],
  });

  return NextResponse.json({ ok: true, upserted: totalUpserted });
}
