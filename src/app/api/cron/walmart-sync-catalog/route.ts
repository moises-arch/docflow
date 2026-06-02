// Daily catalog sync — pulls all items from Walmart and upserts walmart_items.
// Cron: 0 3 * * * (3am every day).

import { createServiceClient } from "@/lib/supabase/service";
import { iterateAllItems } from "@/lib/walmart/api/items";
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

  let totalUpserted = 0;
  const errors: string[] = [];

  try {
    for await (const batch of iterateAllItems({ correlationId, limit: 200 })) {
      const rows = batch.map((it) => ({
        tenant_id: tenantId,
        walmart_item_id: it.wpid ?? it.sku,
        sku: it.sku,
        product_name: it.productName ?? null,
        status: it.lifecycleStatus ?? null,
        publish_status: it.publishedStatus ?? null,
        upc: it.upc ?? null,
        category: it.productType ?? null,
        price: it.price?.amount ?? null,
        currency: it.price?.currency ?? "USD",
        ship_node_type: it.shipNodeType ?? null,
        raw_data: it as unknown as Record<string, unknown>,
        synced_at: new Date().toISOString(),
      }));

      const { error } = await (
        svc.from("walmart_items") as unknown as {
          upsert: (
            v: Record<string, unknown>[],
            opts: { onConflict: string },
          ) => Promise<{ error: { message?: string } | null }>;
        }
      ).upsert(rows, { onConflict: "tenant_id,walmart_item_id" });

      if (error) {
        errors.push(error.message ?? "upsert error");
      } else {
        totalUpserted += rows.length;
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  await svc.from("walmart_smoke_runs").insert({
    tenant_id: tenantId,
    ok: errors.length === 0,
    checks: [
      {
        name: "sync_catalog",
        ok: errors.length === 0,
        detail: `upserted=${totalUpserted}${errors.length ? ` errors=${errors.join("|")}` : ""}`,
      },
    ],
  });

  return NextResponse.json({
    ok: errors.length === 0,
    upserted: totalUpserted,
    errors,
  });
}
