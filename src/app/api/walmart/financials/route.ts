// Financials endpoint — revenue gross/net + AOV + monthly trend.

import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Order = {
  parsed_payload: { totals?: { grand_total?: number; subtotal?: number } } | null;
  created_at: string;
  state: string;
};
type Refund = { refund_amount: number | null; created_at: string };

export async function GET() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const { data: ordersData } = await db
    .from<Order>("walmart_orders")
    .select("parsed_payload, created_at, state")
    .eq("tenant_id", tenantId)
    .eq("state", "downloaded")
    .gte("created_at", oneYearAgo.toISOString());

  const { data: returnsData } = await db
    .from<Refund>("walmart_returns")
    .select("refund_amount, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", oneYearAgo.toISOString());

  const ordersList = (Array.isArray(ordersData) ? ordersData : []) as Order[];
  const returnsList = (Array.isArray(returnsData) ? returnsData : []) as Refund[];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const sumGross = (items: Order[]) =>
    items.reduce((s: number, o: Order) => s + (o.parsed_payload?.totals?.grand_total ?? 0), 0);

  const today = ordersList.filter((o) => new Date(o.created_at) >= todayStart);
  const week = ordersList.filter((o) => new Date(o.created_at) >= weekAgo);
  const month = ordersList.filter((o) => new Date(o.created_at) >= monthAgo);

  const refundsMonth = returnsList
    .filter((r) => new Date(r.created_at) >= monthAgo)
    .reduce((s: number, r: Refund) => s + (r.refund_amount ?? 0), 0);

  const byMonth: Record<string, { revenue: number; orders: number }> = {};
  for (const o of ordersList) {
    const k = o.created_at.slice(0, 7);
    const existing = byMonth[k] ?? { revenue: 0, orders: 0 };
    existing.revenue += o.parsed_payload?.totals?.grand_total ?? 0;
    existing.orders += 1;
    byMonth[k] = existing;
  }
  const monthlyTrend = Object.entries(byMonth)
    .map(([month, data]) => ({ month, ...data, revenue: +data.revenue.toFixed(2) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const aov = month.length > 0 ? sumGross(month) / month.length : 0;

  return NextResponse.json({
    today: { orders: today.length, revenue: +sumGross(today).toFixed(2) },
    week: { orders: week.length, revenue: +sumGross(week).toFixed(2) },
    month: {
      orders: month.length,
      revenue_gross: +sumGross(month).toFixed(2),
      refunds: +refundsMonth.toFixed(2),
      revenue_net: +(sumGross(month) - refundsMonth).toFixed(2),
      aov: +aov.toFixed(2),
    },
    year: { orders: ordersList.length, revenue: +sumGross(ordersList).toFixed(2) },
    monthly_trend: monthlyTrend,
  });
}
