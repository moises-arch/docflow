import { requireSettingsAccess } from "../../../settings/_lib";
import { KpiCard } from "../_components/kpi-card";
import { AlertTriangle, Package, TrendingDown } from "lucide-react";

export const dynamic = "force-dynamic";

type Item = {
  walmart_item_id: string;
  sku: string;
  product_name: string | null;
  inventory_total: number | null;
  units_sold_30d: number | null;
  lag_time_days: number | null;
};

export default async function InventoryPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const { data } = await supabase
    .from("walmart_items")
    .select("walmart_item_id,sku,product_name,inventory_total,units_sold_30d,lag_time_days")
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE")
    .order("inventory_total", { ascending: true })
    .returns<Item[]>();

  const list = (data ?? []) as Item[];
  const oos = list.filter((i) => (i.inventory_total ?? 0) === 0);
  const low = list.filter((i) => {
    const v = i.inventory_total ?? 0;
    return v > 0 && v < 10;
  });
  const willRunOut = list.filter((i) => {
    const sold = i.units_sold_30d ?? 0;
    const inv = i.inventory_total ?? 0;
    return sold > 0 && inv > 0 && inv < sold;
  });

  return (
    <div className="grid gap-4">
      <div className="mb-4 flex items-center gap-2 text-[var(--color-fg-mute)]">
        <Package size={15} />
        <span className="text-sm font-medium">Inventario</span>
      </div>
      <h1 className="text-lg font-semibold">Inventario</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={<Package size={12} />} label="Total ACTIVE" value={list.length} />
        <KpiCard
          icon={<AlertTriangle size={12} />}
          label="Out of stock"
          value={oos.length}
          tone={oos.length > 0 ? "error" : "neutral"}
        />
        <KpiCard
          label="Stock bajo"
          value={low.length}
          hint="< 10 unidades"
          tone={low.length > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          icon={<TrendingDown size={12} />}
          label="Se acaba pronto"
          value={willRunOut.length}
          hint="Stock < ventas 30d"
          tone={willRunOut.length > 0 ? "warn" : "neutral"}
        />
      </div>

      {oos.length > 0 && (
        <Section title={`Out of stock (${oos.length})`} items={oos.slice(0, 50)} />
      )}
      {low.length > 0 && (
        <Section title={`Stock bajo (${low.length})`} items={low.slice(0, 50)} />
      )}
      {willRunOut.length > 0 && (
        <Section title={`Se acaba pronto (${willRunOut.length})`} items={willRunOut.slice(0, 30)} />
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] p-4">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-[var(--color-fg-mute)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="px-3 py-2 text-right">Vendidos 30d</th>
              <th className="px-3 py-2 text-right">Lag time</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.walmart_item_id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-3 py-1.5 font-mono">{i.sku}</td>
                <td className="px-3 py-1.5 text-[var(--color-fg-mute)]">{(i.product_name ?? "").slice(0, 60)}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${
                  (i.inventory_total ?? 0) === 0 ? "text-red-600 font-semibold" : ""
                }`}>{i.inventory_total ?? 0}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{i.units_sold_30d ?? 0}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{i.lag_time_days ?? "—"}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
