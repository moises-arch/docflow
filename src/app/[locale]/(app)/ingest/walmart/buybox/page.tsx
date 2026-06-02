import { requireSettingsAccess } from "../../../settings/_lib";
import { KpiCard } from "../_components/kpi-card";
import { Trophy, TrendingDown, Star } from "lucide-react";

export const dynamic = "force-dynamic";

type Item = {
  walmart_item_id: string;
  sku: string;
  product_name: string | null;
  price: number | null;
  buybox_winning: boolean | null;
  buybox_winner_price: number | null;
};

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function BuyBoxPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const { data } = await supabase
    .from("walmart_items")
    .select("walmart_item_id,sku,product_name,price,buybox_winning,buybox_winner_price")
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE")
    .returns<Item[]>();

  const items = (data ?? []) as Item[];
  const winning = items.filter((i) => i.buybox_winning === true);
  const losing = items.filter((i) => i.buybox_winning === false);
  const noData = items.filter((i) => i.buybox_winning === null);

  const losingWithGap = losing
    .filter((i) => i.price && i.buybox_winner_price)
    .map((i) => ({
      ...i,
      gap: +(((i.price ?? 0) - (i.buybox_winner_price ?? 0))).toFixed(2),
      gap_pct:
        i.buybox_winner_price && i.buybox_winner_price > 0
          ? +(((i.price ?? 0) - i.buybox_winner_price) / i.buybox_winner_price * 100).toFixed(2)
          : 0,
    }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 30);

  const winRate = items.length > 0 ? (winning.length / items.length) * 100 : 0;

  return (
    <div className="grid gap-4">
      <div className="mb-4 flex items-center gap-2 text-[var(--color-fg-mute)]">
        <Star size={15} />
        <span className="text-sm font-medium">Buy Box Insights</span>
      </div>
      <h1 className="text-lg font-semibold">Buy Box Insights</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={<Trophy size={12} />}
          label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          tone={winRate >= 70 ? "ok" : winRate >= 50 ? "warn" : "error"}
        />
        <KpiCard label="Items Ganando" value={winning.length} tone="ok" />
        <KpiCard
          icon={<TrendingDown size={12} />}
          label="Items Perdiendo"
          value={losing.length}
          tone={losing.length > 0 ? "warn" : "neutral"}
        />
        <KpiCard label="Sin datos" value={noData.length} tone="neutral" />
      </div>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold">Top 30 items perdiendo Buy Box</h2>
          <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
            Ordenados por mayor gap de precio (oportunidad de ajuste)
          </p>
        </div>
        {losingWithGap.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-fg-mute)]">
            {items.length === 0
              ? "Aún no hay datos. Ejecutá el sync cron desde Configuración."
              : "🏆 No estás perdiendo el Buy Box en ningún item."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-[var(--color-fg-mute)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-right">Tu Precio</th>
                  <th className="px-3 py-2 text-right">Buy Box</th>
                  <th className="px-3 py-2 text-right">Gap</th>
                  <th className="px-3 py-2 text-right">Gap %</th>
                </tr>
              </thead>
              <tbody>
                {losingWithGap.map((i) => (
                  <tr key={i.walmart_item_id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 font-mono">{i.sku}</td>
                    <td className="px-3 py-2 text-[var(--color-fg-mute)]">
                      {(i.product_name ?? "").slice(0, 60)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(i.price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600">
                      {fmt(i.buybox_winner_price)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600">+{fmt(i.gap)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600">+{i.gap_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
