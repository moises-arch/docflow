// Inventory endpoint — stock levels + low-stock alerts + history snapshots.

import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Item = {
  walmart_item_id: string;
  sku: string;
  product_name: string | null;
  status: string | null;
  inventory_total: number | null;
  lag_time_days: number | null;
  units_sold_30d: number | null;
};

export async function GET() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  const { data } = await db
    .from<Item>("walmart_items")
    .select(
      "walmart_item_id, sku, product_name, status, inventory_total, lag_time_days, units_sold_30d",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE")
    .order("inventory_total", { ascending: true });

  const list = (Array.isArray(data) ? data : []) as Item[];

  const outOfStock = list.filter((i) => (i.inventory_total ?? 0) === 0);
  const lowStock = list.filter((i) => {
    const inv = i.inventory_total ?? 0;
    return inv > 0 && inv < 10;
  });
  const healthy = list.filter((i) => (i.inventory_total ?? 0) >= 10);
  const willRunOut = list.filter((i) => {
    const sold = i.units_sold_30d ?? 0;
    const inv = i.inventory_total ?? 0;
    return sold > 0 && inv > 0 && inv < sold;
  });

  return NextResponse.json({
    summary: {
      total_active: list.length,
      out_of_stock: outOfStock.length,
      low_stock: lowStock.length,
      healthy: healthy.length,
      will_run_out_in_30d: willRunOut.length,
    },
    out_of_stock: outOfStock.slice(0, 50),
    low_stock: lowStock.slice(0, 50),
    will_run_out: willRunOut.slice(0, 30),
  });
}
