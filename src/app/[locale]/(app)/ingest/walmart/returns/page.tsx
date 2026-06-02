import { requireSettingsAccess } from "../../../settings/_lib";
import { KpiCard } from "../_components/kpi-card";
import { RotateCcw } from "lucide-react";

export const dynamic = "force-dynamic";

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

export default async function ReturnsPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { data } = await supabase
    .from("walmart_returns")
    .select(
      "return_order_id,customer_order_id,walmart_po_id,return_status,return_reason,refund_amount,refund_status,return_lines,created_at",
    )
    .eq("tenant_id", tenantId)
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: false })
    .returns<ReturnRow[]>();

  const list = (data ?? []) as ReturnRow[];
  const open = list.filter((r) =>
    ["INITIATED", "DELIVERED"].includes(r.return_status ?? ""),
  );
  const totalRefunded = list.reduce((s, r) => s + (r.refund_amount ?? 0), 0);

  // Reason breakdown
  const reasons: Record<string, number> = {};
  for (const r of list) {
    const k = r.return_reason ?? "Sin razón";
    reasons[k] = (reasons[k] ?? 0) + 1;
  }

  // Top SKUs returned
  const skuCounts: Record<string, { count: number; productName: string | null }> = {};
  for (const r of list) {
    const lines = (r.return_lines as Array<{ item?: { sku?: string; productName?: string } }>) ?? [];
    for (const ln of lines) {
      const sku = ln.item?.sku;
      if (!sku) continue;
      const e = skuCounts[sku] ?? { count: 0, productName: null };
      e.count += 1;
      e.productName = ln.item?.productName ?? e.productName;
      skuCounts[sku] = e;
    }
  }
  const topSkus = Object.entries(skuCounts)
    .map(([sku, info]) => ({ sku, count: info.count, productName: info.productName }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <div className="grid gap-4">
      <div className="mb-4 flex items-center gap-2 text-[var(--color-fg-mute)]">
        <RotateCcw size={15} />
        <span className="text-sm font-medium">Returns & Refunds</span>
      </div>
      <h1 className="text-lg font-semibold">Returns & Refunds</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={<RotateCcw size={12} />}
          label="Returns 30d"
          value={list.length}
        />
        <KpiCard
          label="Abiertos"
          value={open.length}
          tone={open.length > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Refundeado 30d"
          value={`$${totalRefunded.toFixed(2)}`}
          tone="error"
        />
        <KpiCard label="SKUs distintos" value={topSkus.length} />
      </div>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold">Returns abiertos</h2>
        </div>
        {open.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--color-fg-mute)]">
            No hay returns pendientes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-[var(--color-fg-mute)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left">Return ID</th>
                  <th className="px-3 py-2 text-left">PO</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Razón</th>
                  <th className="px-3 py-2 text-right">Refund</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {open.slice(0, 30).map((r) => (
                  <tr key={r.return_order_id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-1.5 font-mono">{r.return_order_id}</td>
                    <td className="px-3 py-1.5 font-mono text-[var(--color-fg-mute)]">{r.walmart_po_id ?? "—"}</td>
                    <td className="px-3 py-1.5">{r.return_status ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--color-fg-mute)]">{r.return_reason ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      ${r.refund_amount?.toFixed(2) ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-fg-mute)]">
                      {new Date(r.created_at).toLocaleDateString("es-MX")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Razones de devolución</h2>
          {Object.keys(reasons).length === 0 ? (
            <div className="text-xs text-[var(--color-fg-mute)]">Sin datos.</div>
          ) : (
            <ul className="grid gap-1 text-xs">
              {Object.entries(reasons)
                .sort(([, a], [, b]) => b - a)
                .map(([reason, count]) => (
                  <li
                    key={reason}
                    className="flex items-center justify-between rounded-sm border bg-background px-3 py-1.5"
                  >
                    <span className="text-[var(--color-fg-mute)]">{reason}</span>
                    <span className="font-semibold tabular-nums">{count}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Top SKUs devueltos</h2>
          {topSkus.length === 0 ? (
            <div className="text-xs text-[var(--color-fg-mute)]">Sin datos.</div>
          ) : (
            <ul className="grid gap-1 text-xs">
              {topSkus.map((s) => (
                <li
                  key={s.sku}
                  className="flex items-center justify-between rounded-sm border bg-background px-3 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="font-mono">{s.sku}</code>
                    <span className="truncate text-[var(--color-fg-mute)]">{s.productName?.slice(0, 40)}</span>
                  </div>
                  <span className="font-semibold tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
