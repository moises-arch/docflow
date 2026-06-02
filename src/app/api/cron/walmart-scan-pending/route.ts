// Walmart orders rescue cron — every 30 min.
// Polls /v3/orders/released for any new POs that didn't arrive via webhook
// (or whose webhook was dropped). For each PO not in walmart_orders OR
// not in state=downloaded, dispatches to the process handler.

import { createServiceClient } from "@/lib/supabase/service";
import { getReleasedOrders } from "@/lib/walmart/api/orders";
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

  // Single-tenant: take the first tenant
  const { data: tenants } = await svc
    .from("tenants")
    .select("id")
    .limit(1)
    .returns<Array<{ id: string }>>();
  const tenantId = tenants?.[0]?.id;
  if (!tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 422 });
  }

  // Already-downloaded set
  const { data: existing } = await svc
    .from("walmart_orders")
    .select("walmart_po_id, state")
    .eq("tenant_id", tenantId)
    .returns<Array<{ walmart_po_id: string; state: string }>>();
  const downloadedSet = new Set(
    (existing ?? []).filter((r) => r.state === "downloaded").map((r) => r.walmart_po_id),
  );

  let dispatched = 0;
  let skipped = 0;
  let cursor: string | undefined = undefined;
  const errors: string[] = [];

  const baseUrl = process.env.INTAKE_PUBLIC_APP_URL ?? "https://app.example.com";
  const internalToken = process.env.INTAKE_WALMART_INTERNAL_TOKEN;

  for (let page = 0; page < 5; page++) {
    let response;
    try {
      response = await getReleasedOrders({
        limit: 100,
        cursor,
        correlationId,
      });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }

    const orders = response.list?.elements?.order ?? [];
    if (orders.length === 0) break;

    for (const o of orders) {
      const po = o.purchaseOrderId;
      if (downloadedSet.has(po)) {
        skipped += 1;
        continue;
      }

      // Upsert as cron_rescue source
      await (
        svc.from("walmart_orders") as unknown as {
          upsert: (
            v: Record<string, unknown>,
            opts: { onConflict: string },
          ) => Promise<{ error: { message?: string } | null }>;
        }
      ).upsert(
        {
          tenant_id: tenantId,
          walmart_po_id: po,
          customer_order_id: o.customerOrderId,
          state: "pending",
          source: "cron_rescue",
          meta: { correlation_id: correlationId },
        },
        { onConflict: "tenant_id,walmart_po_id" },
      );

      // Dispatch
      if (baseUrl && internalToken) {
        fetch(`${baseUrl}/api/ingest/walmart/process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-walmart-internal-token": internalToken,
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            walmart_po_id: po,
            correlation_id: correlationId,
          }),
          signal: AbortSignal.timeout(2000),
        }).catch(() => {});
        dispatched += 1;
      }
    }

    cursor = response.list?.meta?.nextCursor;
    if (!cursor) break;
  }

  // Log to smoke_runs for visibility
  await svc.from("walmart_smoke_runs").insert({
    tenant_id: tenantId,
    ok: errors.length === 0,
    checks: [
      {
        name: "scan_pending",
        ok: errors.length === 0,
        detail: `dispatched=${dispatched} skipped=${skipped}${errors.length ? ` errors=${errors.join(",")}` : ""}`,
      },
    ],
  });

  return NextResponse.json({
    ok: errors.length === 0,
    dispatched,
    skipped,
    errors,
  });
}
