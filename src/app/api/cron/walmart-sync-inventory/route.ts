// Inventory sync — every 4h. Updates walmart_items.inventory_total and
// inserts a row into walmart_inventory_snapshots for trend charts.

import { createServiceClient } from "@/lib/supabase/service";
import { getInventoryForSkus } from "@/lib/walmart/api/inventory";
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

  // Get all active items
  const { data: items } = await svc
    .from("walmart_items")
    .select("walmart_item_id, sku")
    .eq("tenant_id", tenantId)
    .in("status", ["ACTIVE", "STAGE"])
    .returns<Array<{ walmart_item_id: string; sku: string }>>();

  const skus = (items ?? []).map((i) => i.sku);
  if (skus.length === 0) {
    return NextResponse.json({ ok: true, reason: "no_active_items" });
  }

  const inventory = await getInventoryForSkus(skus, correlationId);

  // Upsert into walmart_items + insert snapshot
  let updated = 0;
  const snapshots: Array<{ tenant_id: string; walmart_item_id: string; inventory_total: number }> = [];

  for (const item of items ?? []) {
    const qty = inventory.get(item.sku) ?? 0;
    await (
      svc.from("walmart_items") as unknown as {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => Promise<{ error: unknown }>;
          };
        };
      }
    )
      .update({ inventory_total: qty, synced_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("walmart_item_id", item.walmart_item_id);
    snapshots.push({
      tenant_id: tenantId,
      walmart_item_id: item.walmart_item_id,
      inventory_total: qty,
    });
    updated += 1;
  }

  // Bulk insert snapshots
  if (snapshots.length > 0) {
    await svc.from("walmart_inventory_snapshots").insert(snapshots);
  }

  await svc.from("walmart_smoke_runs").insert({
    tenant_id: tenantId,
    ok: true,
    checks: [{ name: "sync_inventory", ok: true, detail: `updated=${updated}` }],
  });

  return NextResponse.json({ ok: true, updated });
}
