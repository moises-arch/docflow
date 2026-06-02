// Walmart historical backfill — populates the dashboard with orders from
// the last N days (default 60). Unlike scan-pending which only fetches
// "released" (unacknowledged) orders, this hits the general orders endpoint
// to get every order regardless of state.
//
// Run manually after first deploy or to backfill a gap. Auth via CRON_SECRET.
//
// Query params:
//   days   — how far back to look (default 60, max 365)
//   process — if "true", actually process each order (download + create draft).
//             If false (default), only inserts into walmart_orders with state=pending.

import { createServiceClient } from "@/lib/supabase/service";
import { getAllOrders } from "@/lib/walmart/api/orders";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? "60")));
  const shouldProcess = url.searchParams.get("process") === "true";
  const correlationId = randomUUID();

  const svc = createServiceClient();
  const { data: tenants } = await svc
    .from("tenants")
    .select("id")
    .limit(1)
    .returns<Array<{ id: string }>>();
  const tenantId = tenants?.[0]?.id;
  if (!tenantId) return NextResponse.json({ error: "no_tenant" }, { status: 422 });

  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Already-known set
  const { data: existing } = await svc
    .from("walmart_orders")
    .select("walmart_po_id")
    .eq("tenant_id", tenantId)
    .returns<Array<{ walmart_po_id: string }>>();
  const knownSet = new Set((existing ?? []).map((r) => r.walmart_po_id));

  let cursor: string | undefined = undefined;
  let inserted = 0;
  let dispatched = 0;
  let skipped = 0;
  const errors: string[] = [];

  const baseUrl = process.env.INTAKE_PUBLIC_APP_URL ?? "https://app.example.com";
  const internalToken = process.env.INTAKE_WALMART_INTERNAL_TOKEN;

  for (let page = 0; page < 10; page++) {
    let response;
    try {
      response = await getAllOrders({
        limit: 100,
        cursor,
        createdStartDate: startDate,
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
      if (knownSet.has(po)) {
        skipped += 1;
        continue;
      }

      // Insert with state=pending so it shows up in the dashboard
      const { error } = await (
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
          customer_order_id: o.customerOrderId ?? null,
          ship_node_id: o.shipNode?.id ?? null,
          state: shouldProcess ? "pending" : "downloaded",
          source: "manual",
          parsed_payload: shouldProcess ? null : (o as unknown as Record<string, unknown>),
          raw_response: o as unknown as Record<string, unknown>,
          meta: { correlation_id: correlationId, source_label: "backfill" },
        },
        { onConflict: "tenant_id,walmart_po_id" },
      );

      if (error) {
        errors.push(`${po}:${error.message}`);
        continue;
      }

      inserted += 1;
      knownSet.add(po);

      // Optionally dispatch to process for full PDF + draft
      if (shouldProcess && baseUrl && internalToken) {
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

  await svc.from("walmart_smoke_runs").insert({
    tenant_id: tenantId,
    ok: errors.length === 0,
    checks: [
      {
        name: "backfill",
        ok: errors.length === 0,
        detail: `days=${days} inserted=${inserted} dispatched=${dispatched} skipped=${skipped}`,
      },
    ],
  });

  return NextResponse.json({
    ok: errors.length === 0,
    days,
    inserted,
    dispatched,
    skipped,
    process_mode: shouldProcess,
    errors,
  });
}
