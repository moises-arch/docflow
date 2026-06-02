// Buy Box insights endpoint — reads from walmart_items (most recent state).

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
  price: number | null;
  buybox_winning: boolean | null;
  buybox_winner_price: number | null;
  status: string | null;
};

export async function GET() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  const { data } = await db
    .from<Item>("walmart_items")
    .select(
      "walmart_item_id, sku, product_name, price, buybox_winning, buybox_winner_price, status",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE");

  const itemsList = (Array.isArray(data) ? data : []) as Item[];

  const winning = itemsList.filter((i) => i.buybox_winning === true);
  const losing = itemsList.filter((i) => i.buybox_winning === false);
  const noData = itemsList.filter((i) => i.buybox_winning === null);

  const losingWithGap = losing
    .filter((i: Item) => i.price && i.buybox_winner_price)
    .map((i: Item) => ({
      ...i,
      price_gap: +(((i.price ?? 0) - (i.buybox_winner_price ?? 0)).toFixed(2)),
      gap_percent:
        i.buybox_winner_price && i.buybox_winner_price > 0
          ? +(((i.price ?? 0) - i.buybox_winner_price) / i.buybox_winner_price * 100).toFixed(2)
          : 0,
    }))
    .sort((a, b) => b.price_gap - a.price_gap)
    .slice(0, 20);

  return NextResponse.json({
    summary: {
      total_active: itemsList.length,
      winning: winning.length,
      losing: losing.length,
      no_data: noData.length,
      win_rate:
        itemsList.length > 0
          ? +((winning.length / itemsList.length) * 100).toFixed(2)
          : 0,
    },
    losing_top_20: losingWithGap,
  });
}
