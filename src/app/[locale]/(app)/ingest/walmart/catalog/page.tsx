import { requireSettingsAccess } from "../../../settings/_lib";
import { KpiCard } from "../_components/kpi-card";
import { Package, BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

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
};

export default async function CatalogPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const { data } = await supabase
    .from("walmart_items")
    .select(
      "walmart_item_id,sku,product_name,status,publish_status,ship_node_type,price,inventory_total,units_sold_30d",
    )
    .eq("tenant_id", tenantId)
    .returns<Item[]>();

  const list = (data ?? []) as Item[];
  const statusCounts: Record<string, number> = {};
  for (const i of list) {
    const s = i.status ?? "UNKNOWN";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }
  const wfs = list.filter((i) => i.ship_node_type === "WFS").length;
  const sf = list.filter((i) => i.ship_node_type === "SellerFulfilled").length;
  const oos = list.filter((i) => (i.inventory_total ?? 0) === 0).length;
  const top = list
    .filter((i) => (i.units_sold_30d ?? 0) > 0)
    .sort((a, b) => (b.units_sold_30d ?? 0) - (a.units_sold_30d ?? 0))
    .slice(0, 10);

  return (
    <div className="grid gap-4">
      <div className="mb-4 flex items-center gap-2 text-[var(--color-fg-mute)]">
        <BookOpen size={15} />
        <span className="text-sm font-medium">Catálogo</span>
      </div>
      <h1 className="text-lg font-semibold">Catálogo</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <KpiCard icon={<Package size={12} />} label="Total" value={list.length} />
        <KpiCard label="Active" value={statusCounts.ACTIVE ?? 0} tone="ok" />
        <KpiCard label="Stage/Retired/Archived" value={
          (statusCounts.STAGE ?? 0) + (statusCounts.RETIRED ?? 0) + (statusCounts.ARCHIVED ?? 0)
        } tone="neutral" />
        <KpiCard label="WFS" value={wfs} tone="info" />
        <KpiCard label="Seller Fulfilled" value={sf} />
        <KpiCard label="Out of stock" value={oos} tone={oos > 0 ? "warn" : "neutral"} />
      </div>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold">Top 10 más vendidos (últimos 30d)</h2>
        </div>
        {top.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-fg-mute)]">
            Aún no hay datos de ventas. El cron diario actualiza esto.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-[var(--color-fg-mute)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Vendidos 30d</th>
                </tr>
              </thead>
              <tbody>
                {top.map((i) => (
                  <tr key={i.walmart_item_id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 font-mono">{i.sku}</td>
                    <td className="px-3 py-2 text-[var(--color-fg-mute)]">{(i.product_name ?? "").slice(0, 60)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">${i.price?.toFixed(2) ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{i.inventory_total ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{i.units_sold_30d ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold">Catálogo completo ({list.length})</h2>
        </div>
        {list.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-fg-mute)]">
            Sin datos. Ejecutá el sync de catálogo desde Configuración.
          </div>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--color-surface)] text-[10px] uppercase text-[var(--color-fg-mute)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Fulfillment</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 200).map((i) => (
                  <tr key={i.walmart_item_id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-1.5 font-mono">{i.sku}</td>
                    <td className="px-3 py-1.5 text-[var(--color-fg-mute)]">{(i.product_name ?? "").slice(0, 60)}</td>
                    <td className="px-3 py-1.5">{i.status ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--color-fg-mute)]">{i.ship_node_type ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">${i.price?.toFixed(2) ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{i.inventory_total ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > 200 && (
              <div className="p-2 text-center text-[10px] text-[var(--color-fg-mute)]">
                Mostrando 200 de {list.length}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
