// Dashboard overview endpoint — KPIs for the Resumen tab.
// Reads from local DB (cached snapshots), no live Walmart API calls.

import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type OrderRow = {
  state: string;
  source: string;
  parsed_payload: { totals?: { grand_total?: number } } | null;
  created_at: string;
  acknowledged_at: string | null;
};

type SmokeRunRow = {
  ok: boolean;
  checks: Array<{ name: string }>;
  created_at: string;
};

export async function GET() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { data: ordersData } = await db
    .from<OrderRow>("walmart_orders")
    .select("state, source, parsed_payload, created_at, acknowledged_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", thirtyDaysAgo.toISOString());

  const ordersList = (Array.isArray(ordersData) ? ordersData : []) as OrderRow[];
  const today = ordersList.filter((o) => new Date(o.created_at) >= todayStart);
  const last7d = ordersList.filter((o) => new Date(o.created_at) >= sevenDaysAgo);

  const sumGross = (items: OrderRow[]) =>
    items
      .filter((o) => o.state === "downloaded")
      .reduce((s, o) => s + (o.parsed_payload?.totals?.grand_total ?? 0), 0);

  const revenueToday = sumGross(today);
  const revenue7d = sumGross(last7d);
  const revenue30d = sumGross(ordersList);

  const sourceBreakdown = {
    webhook: last7d.filter((o) => o.source === "webhook").length,
    cron_rescue: last7d.filter((o) => o.source === "cron_rescue").length,
    manual: last7d.filter((o) => o.source === "manual").length,
  };

  const lastWebhook = ordersList
    .filter((o) => o.source === "webhook")
    .map((o) => o.created_at)
    .sort()
    .pop();

  const pending = ordersList.filter((o) => o.state === "pending" || o.state === "running").length;
  const failed = ordersList.filter((o) => o.state === "failed").length;
  const manualRequired = ordersList.filter((o) => o.state === "manual_required").length;

  const { data: lowStockItems } = await db
    .from<{ id: string }>("walmart_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .lt("inventory_total", 10);

  const { data: openReturnsData } = await db
    .from<{ id: string }>("walmart_returns")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("return_status", ["INITIATED", "DELIVERED"]);

  const { data: lastSyncsData } = await db
    .from<SmokeRunRow>("walmart_smoke_runs")
    .select("ok, checks, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);
  const lastSyncs = (Array.isArray(lastSyncsData) ? lastSyncsData : []) as SmokeRunRow[];

  const lastSyncByName: Record<string, string> = {};
  for (const run of lastSyncs) {
    for (const c of run.checks ?? []) {
      if (!lastSyncByName[c.name]) lastSyncByName[c.name] = run.created_at;
    }
  }

  return NextResponse.json({
    today: { orders: today.length, revenue: +revenueToday.toFixed(2) },
    last_7d: {
      orders: last7d.length,
      revenue: +revenue7d.toFixed(2),
      source_breakdown: sourceBreakdown,
    },
    last_30d: { orders: ordersList.length, revenue: +revenue30d.toFixed(2) },
    pending,
    failed,
    manual_required: manualRequired,
    last_webhook_at: lastWebhook ?? null,
    low_stock_count: Array.isArray(lowStockItems) ? lowStockItems.length : 0,
    open_returns: Array.isArray(openReturnsData) ? openReturnsData.length : 0,
    last_sync: lastSyncByName,
  });
}
