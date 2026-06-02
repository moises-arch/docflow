import { requireSettingsAccess } from "../../../settings/_lib";
import { KpiCard } from "../_components/kpi-card";
import { FinancialsCharts } from "./financials-charts";
import { Calendar, DollarSign, TrendingUp, ShoppingBag } from "lucide-react";

export const dynamic = "force-dynamic";

type Order = {
  parsed_payload: { totals?: { grand_total?: number } } | null;
  state: string;
  created_at: string;
};
type Return = { refund_amount: number | null; created_at: string };

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);
}

export default async function FinancialsPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [{ data: orders }, { data: returns }] = await Promise.all([
    supabase
      .from("walmart_orders")
      .select("parsed_payload,state,created_at")
      .eq("tenant_id", tenantId)
      .eq("state", "downloaded")
      .gte("created_at", oneYearAgo.toISOString())
      .returns<Order[]>(),
    supabase
      .from("walmart_returns")
      .select("refund_amount,created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", oneYearAgo.toISOString())
      .returns<Return[]>(),
  ]);

  const ordersList = (orders ?? []) as Order[];
  const returnsList = (returns ?? []) as Return[];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const sumGross = (items: Order[]) =>
    items.reduce((s, o) => s + (o.parsed_payload?.totals?.grand_total ?? 0), 0);

  const today = ordersList.filter((o) => new Date(o.created_at) >= todayStart);
  const week = ordersList.filter((o) => new Date(o.created_at) >= weekAgo);
  const month = ordersList.filter((o) => new Date(o.created_at) >= monthAgo);

  const refundsMonth = returnsList
    .filter((r) => new Date(r.created_at) >= monthAgo)
    .reduce((s, r) => s + (r.refund_amount ?? 0), 0);
  const grossMonth = sumGross(month);
  const aov = month.length > 0 ? grossMonth / month.length : 0;

  // Monthly trend
  const byMonth: Record<string, { revenue: number; orders: number }> = {};
  for (const o of ordersList) {
    const k = o.created_at.slice(0, 7);
    const e = byMonth[k] ?? { revenue: 0, orders: 0 };
    e.revenue += o.parsed_payload?.totals?.grand_total ?? 0;
    e.orders += 1;
    byMonth[k] = e;
  }
  const monthlyTrend = Object.entries(byMonth)
    .map(([month, data]) => ({ month, revenue: +data.revenue.toFixed(2), orders: data.orders }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);

  return (
    <div className="grid gap-4">
      <div className="mb-4 flex items-center gap-2 text-[var(--color-fg-mute)]">
        <DollarSign size={15} />
        <span className="text-sm font-medium">Financiero</span>
      </div>
      <h1 className="text-lg font-semibold">Financiero</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={<Calendar size={12} />}
          label="Hoy"
          value={fmt(sumGross(today))}
          hint={`${today.length} órdenes`}
          tone="ok"
        />
        <KpiCard
          icon={<TrendingUp size={12} />}
          label="Esta semana"
          value={fmt(sumGross(week))}
          hint={`${week.length} órdenes`}
        />
        <KpiCard
          icon={<DollarSign size={12} />}
          label="Este mes (gross)"
          value={fmt(grossMonth)}
          hint={`Net: ${fmt(grossMonth - refundsMonth)}`}
          tone="ok"
        />
        <KpiCard
          icon={<ShoppingBag size={12} />}
          label="AOV"
          value={fmt(aov)}
          hint="Average Order Value"
        />
      </div>

      <FinancialsCharts data={monthlyTrend} />

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Revenue año" value={fmt(sumGross(ordersList))} tone="info" />
        <KpiCard label="Refunds mes" value={fmt(refundsMonth)} tone="error" />
        <KpiCard
          label="Refund rate mes"
          value={
            grossMonth > 0
              ? `${((refundsMonth / grossMonth) * 100).toFixed(2)}%`
              : "—"
          }
          tone={refundsMonth / grossMonth > 0.06 ? "warn" : "neutral"}
        />
      </div>
    </div>
  );
}
