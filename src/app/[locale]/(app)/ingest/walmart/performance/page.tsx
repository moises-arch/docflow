import { requireSettingsAccess } from "../../../settings/_lib";
import { KpiCard } from "../_components/kpi-card";
import { TrendingUp, TrendingDown } from "lucide-react";

export const dynamic = "force-dynamic";

type Snapshot = {
  on_time_delivery_rate: number | null;
  valid_tracking_rate: number | null;
  seller_response_rate: number | null;
  refund_rate: number | null;
  cancellation_rate: number | null;
  taken_at: string;
};

function pct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

function rateTone(v: number | null, thresholdGood: number, thresholdWarn: number): "ok" | "warn" | "error" | "neutral" {
  if (v == null) return "neutral";
  if (v >= thresholdGood) return "ok";
  if (v >= thresholdWarn) return "warn";
  return "error";
}

function inverseRateTone(v: number | null, thresholdGood: number, thresholdWarn: number): "ok" | "warn" | "error" | "neutral" {
  // For metrics where lower is better (refund rate, cancellation rate)
  if (v == null) return "neutral";
  if (v <= thresholdGood) return "ok";
  if (v <= thresholdWarn) return "warn";
  return "error";
}

export default async function PerformancePage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const { data } = await supabase
    .from("walmart_performance_snapshots")
    .select(
      "on_time_delivery_rate,valid_tracking_rate,seller_response_rate,refund_rate,cancellation_rate,taken_at",
    )
    .eq("tenant_id", tenantId)
    .order("taken_at", { ascending: false })
    .limit(30)
    .returns<Snapshot[]>();

  const list = (data ?? []) as Snapshot[];
  const latest = list[0] ?? null;
  const prev = list[1] ?? null;

  function trend(curr: number | null, prev: number | null) {
    if (curr == null || prev == null) return null;
    const diff = curr - prev;
    if (Math.abs(diff) < 0.001) return null;
    return diff > 0 ? "up" : "down";
  }

  return (
    <div className="grid gap-4">
      <div className="mb-4 flex items-center gap-2 text-[var(--color-fg-mute)]">
        <TrendingUp size={15} />
        <span className="text-sm font-medium">Seller Performance</span>
      </div>
      <h1 className="text-lg font-semibold">Seller Performance Scorecard</h1>
      {!latest && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-fg-mute)]">
          No hay datos de performance todavía. El cron diario se ejecuta a las 4am — podés
          forzar la primera corrida desde la pestaña Configuración.
        </div>
      )}

      {latest && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <KpiCard
              label="On-time Delivery"
              value={pct(latest.on_time_delivery_rate)}
              tone={rateTone(latest.on_time_delivery_rate, 0.95, 0.9)}
              hint={`Anterior: ${pct(prev?.on_time_delivery_rate ?? null)}`}
              icon={
                trend(latest.on_time_delivery_rate, prev?.on_time_delivery_rate ?? null) === "up" ? (
                  <TrendingUp size={12} />
                ) : trend(latest.on_time_delivery_rate, prev?.on_time_delivery_rate ?? null) === "down" ? (
                  <TrendingDown size={12} />
                ) : null
              }
            />
            <KpiCard
              label="Valid Tracking"
              value={pct(latest.valid_tracking_rate)}
              tone={rateTone(latest.valid_tracking_rate, 0.99, 0.95)}
              hint="Threshold Marketplace: ≥99%"
            />
            <KpiCard
              label="Seller Response"
              value={pct(latest.seller_response_rate)}
              tone={rateTone(latest.seller_response_rate, 0.95, 0.85)}
            />
            <KpiCard
              label="Refund Rate"
              value={pct(latest.refund_rate)}
              tone={inverseRateTone(latest.refund_rate, 0.06, 0.1)}
              hint="Menor = mejor"
            />
            <KpiCard
              label="Cancel Rate"
              value={pct(latest.cancellation_rate)}
              tone={inverseRateTone(latest.cancellation_rate, 0.025, 0.05)}
              hint="Menor = mejor"
            />
          </div>

          <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Tendencia (últimos 30 días)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase text-[var(--color-fg-mute)]">
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-right">On-time</th>
                    <th className="px-3 py-2 text-right">Tracking</th>
                    <th className="px-3 py-2 text-right">Response</th>
                    <th className="px-3 py-2 text-right">Refund</th>
                    <th className="px-3 py-2 text-right">Cancel</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, 30).map((s) => (
                    <tr key={s.taken_at} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-1.5 text-[var(--color-fg-mute)]">
                        {new Date(s.taken_at).toLocaleDateString("es-MX", { dateStyle: "short" })}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{pct(s.on_time_delivery_rate)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{pct(s.valid_tracking_rate)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{pct(s.seller_response_rate)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{pct(s.refund_rate)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{pct(s.cancellation_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
