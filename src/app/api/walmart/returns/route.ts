// Returns endpoint — open returns + reason breakdown + top returned SKUs.

import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReturnRow = {
  return_order_id: string;
  customer_order_id: string | null;
  walmart_po_id: string | null;
  return_status: string | null;
  return_reason: string | null;
  refund_amount: number | null;
  refund_status: string | null;
  return_lines: unknown;
  created_at: string;
};

export async function GET() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { data } = await db
    .from<ReturnRow>("walmart_returns")
    .select(
      "return_order_id, customer_order_id, walmart_po_id, return_status, return_reason, refund_amount, refund_status, return_lines, created_at",
    )
    .eq("tenant_id", tenantId)
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  const list = (Array.isArray(data) ? data : []) as ReturnRow[];

  const statusCounts: Record<string, number> = {};
  for (const r of list) {
    const s = r.return_status ?? "UNKNOWN";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const reasonCounts: Record<string, number> = {};
  for (const r of list) {
    const reason = r.return_reason ?? "Not specified";
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }

  const skuCounts: Record<string, { count: number; product_name: string | null }> = {};
  for (const r of list) {
    const lines =
      (r.return_lines as Array<{ item?: { sku?: string; productName?: string } }>) ?? [];
    for (const ln of lines) {
      const sku = ln.item?.sku;
      if (!sku) continue;
      const existing = skuCounts[sku] ?? { count: 0, product_name: null };
      existing.count += 1;
      existing.product_name = ln.item?.productName ?? existing.product_name;
      skuCounts[sku] = existing;
    }
  }
  const topReturned = Object.entries(skuCounts)
    .map(([sku, info]) => ({ sku, count: info.count, product_name: info.product_name }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const totalRefunded = list.reduce((s: number, r: ReturnRow) => s + (r.refund_amount ?? 0), 0);
  const open = list.filter((r) =>
    ["INITIATED", "DELIVERED"].includes(r.return_status ?? ""),
  );

  return NextResponse.json({
    summary: {
      total_30d: list.length,
      open_count: open.length,
      total_refunded_30d: +totalRefunded.toFixed(2),
      status_counts: statusCounts,
    },
    reason_breakdown: reasonCounts,
    top_returned_skus: topReturned,
    open_returns: open.slice(0, 50),
    recent: list.slice(0, 30),
  });
}
