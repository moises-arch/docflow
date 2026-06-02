// Catalog endpoint — items + status counts + top sellers + WFS split.

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
  publish_status: string | null;
  ship_node_type: string | null;
  price: number | null;
  inventory_total: number | null;
  units_sold_30d: number | null;
  last_sale_date: string | null;
};

export async function GET() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  const { data } = await db
    .from<Item>("walmart_items")
    .select(
      "walmart_item_id, sku, product_name, status, publish_status, ship_node_type, price, inventory_total, units_sold_30d, last_sale_date",
    )
    .eq("tenant_id", tenantId);

  const list = (Array.isArray(data) ? data : []) as Item[];

  const statusCounts: Record<string, number> = {};
  for (const i of list) {
    const s = i.status ?? "UNKNOWN";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const wfs = list.filter((i: Item) => i.ship_node_type === "WFS").length;
  const sellerFulfilled = list.filter((i: Item) => i.ship_node_type === "SellerFulfilled").length;
  const inStock = list.filter((i: Item) => (i.inventory_total ?? 0) > 0).length;
  const outOfStock = list.filter((i: Item) => (i.inventory_total ?? 0) === 0).length;

  const topSellers = list
    .filter((i: Item) => (i.units_sold_30d ?? 0) > 0)
    .sort((a: Item, b: Item) => (b.units_sold_30d ?? 0) - (a.units_sold_30d ?? 0))
    .slice(0, 10);

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const stale = list
    .filter(
      (i: Item) =>
        i.status === "ACTIVE" &&
        (!i.last_sale_date || new Date(i.last_sale_date) < sixtyDaysAgo),
    )
    .slice(0, 20);

  return NextResponse.json({
    summary: {
      total: list.length,
      status_counts: statusCounts,
      wfs,
      seller_fulfilled: sellerFulfilled,
      in_stock: inStock,
      out_of_stock: outOfStock,
    },
    top_sellers: topSellers,
    stale_items: stale,
    items: list.slice(0, 100),
  });
}
