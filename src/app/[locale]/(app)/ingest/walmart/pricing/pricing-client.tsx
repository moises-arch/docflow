"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { KpiCard } from "../_components/kpi-card";

type PromoItem = {
  sku: string;
  promoPrice?: { amount: number; currency: string };
  comparisonPrice?: { amount: number; currency: string };
  promoEffectiveDate?: string;
  promoExpirationDate?: string;
};
type IncentiveItem = {
  itemId: string;
  productName: string;
  skuId: string;
  targetPrice: { amount: number; currency: string };
  incentiveType: string;
  baseReferralFee: number;
  reducedReferralFee: number;
};

type PricingData = {
  promotional?: PromoItem[] | { error: string };
  incentives?: IncentiveItem[] | { error: string };
  summary?: { promo_count: number; incentive_count: number };
};

export function PricingClient() {
  const [data, setData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/walmart/pricing")
      .then((r) => r.json())
      .then((d) => setData(d as PricingData))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={20} className="animate-spin text-[var(--color-fg-mute)]" />
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30">
        Error: {err ?? "no data"}
      </div>
    );
  }

  const promo = Array.isArray(data.promotional) ? data.promotional : [];
  const incentive = Array.isArray(data.incentives) ? data.incentives : [];

  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold">Pricing & Promociones</h1>

      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Items con promo activa" value={promo.length} tone="info" />
        <KpiCard label="Items elegibles para incentive" value={incentive.length} tone="warn" />
      </div>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold">Precios promocionales activos</h2>
        </div>
        {promo.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--color-fg-mute)]">
            No hay promociones activas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-[var(--color-fg-mute)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-right">Precio promo</th>
                  <th className="px-3 py-2 text-right">Comparativo</th>
                  <th className="px-3 py-2 text-left">Vigencia</th>
                </tr>
              </thead>
              <tbody>
                {promo.map((p) => (
                  <tr key={p.sku} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-1.5 font-mono">{p.sku}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">
                      ${p.promoPrice?.amount?.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-fg-mute)]">
                      ${p.comparisonPrice?.amount?.toFixed(2) ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-fg-mute)]">
                      {p.promoEffectiveDate?.slice(0, 10) ?? "—"} →{" "}
                      {p.promoExpirationDate?.slice(0, 10) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold">Items elegibles para Price Incentive</h2>
          <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
            Bajar el precio al target → reduced referral fee. Oportunidad de margin.
          </p>
        </div>
        {incentive.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--color-fg-mute)]">
            Ningún item elegible actualmente.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-[var(--color-fg-mute)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-right">Target Price</th>
                  <th className="px-3 py-2 text-right">Fee actual</th>
                  <th className="px-3 py-2 text-right">Fee reducido</th>
                </tr>
              </thead>
              <tbody>
                {incentive.map((i) => (
                  <tr key={i.itemId} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-1.5 font-mono">{i.skuId}</td>
                    <td className="px-3 py-1.5 text-[var(--color-fg-mute)]">{i.productName.slice(0, 60)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      ${i.targetPrice.amount.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {i.baseReferralFee?.toFixed(1)}%
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">
                      {i.reducedReferralFee?.toFixed(1)}%
                    </td>
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
