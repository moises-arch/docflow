// Resumen tab — KPIs principales + alertas + actividad reciente.

import Image from "next/image";
import { requireSettingsAccess } from "../../settings/_lib";
import { KpiCard } from "./_components/kpi-card";
import { Link } from "@/i18n/navigation";
import {
  AlertTriangle,
  Clock,
  Download,
  HandHelping,
  Package,
  RefreshCw,
  TrendingUp,
  Zap,
} from "lucide-react";

export const dynamic = "force-dynamic";

type ParsedTotals = { grand_total?: number };
type Order = {
  id: string;
  walmart_po_id: string;
  state: string;
  source: string;
  parsed_payload: { totals?: ParsedTotals } | null;
  created_at: string;
};
type SmokeRun = {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  created_at: string;
};

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default async function WalmartOverviewPage() {
  const { supabase, tenantId } = await requireSettingsAccess();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [{ data: orders }, { data: smokeRuns }, { count: lowStockCount }, { count: openReturns }] =
    await Promise.all([
      supabase
        .from("walmart_orders")
        .select("id, walmart_po_id, state, source, parsed_payload, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .returns<Order[]>(),
      supabase
        .from("walmart_smoke_runs")
        .select("ok, checks, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .returns<SmokeRun[]>(),
      supabase
        .from("walmart_items")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .lt("inventory_total", 10),
      supabase
        .from("walmart_returns")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("return_status", ["INITIATED", "DELIVERED"]),
    ]);

  const ordersList = (orders ?? []) as Order[];
  const today = ordersList.filter((o) => new Date(o.created_at) >= todayStart);
  const downloadedToday = today.filter((o) => o.state === "downloaded");
  const revenueToday = downloadedToday.reduce(
    (s, o) => s + (o.parsed_payload?.totals?.grand_total ?? 0),
    0,
  );
  const pending = ordersList.filter(
    (o) => o.state === "pending" || o.state === "running",
  ).length;
  const failed = ordersList.filter((o) => o.state === "failed").length;
  const manualReq = ordersList.filter((o) => o.state === "manual_required").length;

  const lastWebhook = ordersList
    .filter((o) => o.source === "webhook")
    .map((o) => o.created_at)
    .sort()
    .pop();

  const lastSmoke = (smokeRuns ?? [])[0];
  const smokeOk = lastSmoke?.ok ?? null;

  return (
    <div className="grid gap-4">
      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center gap-3">
          <Image src="/connector-logo.svg" alt="Marketplace Marketplace" width={110} height={32} className="h-8 w-auto" />
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
            API activa
          </span>
        </div>
      </div>

      {/* Alerta stock bajo */}
      {(lowStockCount ?? 0) > 0 && (
        <Link href="/ingest/walmart/inventory" className="block">
          <div className="flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/50">
            <AlertTriangle size={16} className="shrink-0" />
            <span>
              <strong>{lowStockCount} items</strong> con stock bajo (&lt; 10 unidades). Ver inventario →
            </span>
          </div>
        </Link>
      )}

      {/* Alerts */}
      {(smokeOk === false || failed > 0 || manualReq > 0) && (
        <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">
              {smokeOk === false
                ? "Smoke test detectó problemas"
                : `${failed + manualReq} orden(es) requieren atención`}
            </div>
            {lastSmoke && smokeOk === false && (
              <ul className="mt-1 list-inside list-disc text-xs">
                {lastSmoke.checks
                  .filter((c) => !c.ok)
                  .map((c) => (
                    <li key={c.name}>
                      <code>{c.name}</code> — {c.detail}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Link href="/ingest/walmart/financials" className="block">
          <KpiCard
            icon={<TrendingUp size={12} />}
            label="Revenue hoy"
            value={fmtCurrency(revenueToday)}
            hint={`${today.length} órdenes`}
            tone="ok"
            className="h-full hover:border-[var(--color-fg-mute)] transition-colors"
          />
        </Link>
        <KpiCard
          icon={<Download size={12} />}
          label="Descargados hoy"
          value={downloadedToday.length}
          tone="ok"
        />
        <KpiCard
          icon={<Clock size={12} />}
          label="Pendientes"
          value={pending}
          tone={pending > 0 ? "warn" : "neutral"}
        />
        <Link href="/ingest/walmart/orders" className="block">
          <KpiCard
            icon={<AlertTriangle size={12} />}
            label="Fallidos"
            value={failed}
            tone={failed > 0 ? "error" : "neutral"}
            className="h-full hover:border-[var(--color-fg-mute)] transition-colors"
          />
        </Link>
        <Link href="/ingest/walmart/orders" className="block">
          <KpiCard
            icon={<HandHelping size={12} />}
            label="Manual"
            value={manualReq}
            tone={manualReq > 0 ? "warn" : "neutral"}
            className="h-full hover:border-[var(--color-fg-mute)] transition-colors"
          />
        </Link>
        <Link href="/ingest/walmart/inventory" className="block">
          <KpiCard
            icon={<Package size={12} />}
            label="Stock bajo"
            value={lowStockCount ?? 0}
            hint="< 10 unidades"
            tone={(lowStockCount ?? 0) > 0 ? "warn" : "neutral"}
            className="h-full hover:border-[var(--color-fg-mute)] transition-colors"
          />
        </Link>
        <Link href="/ingest/walmart/returns" className="block">
          <KpiCard
            icon={<RefreshCw size={12} />}
            label="Returns abiertos"
            value={openReturns ?? 0}
            tone={(openReturns ?? 0) > 0 ? "warn" : "neutral"}
            className="h-full hover:border-[var(--color-fg-mute)] transition-colors"
          />
        </Link>
      </div>

      {/* Source health */}
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Zap size={14} className="text-[var(--color-fg-mute)]" />
          Origen de las órdenes (últimos 7 días)
        </h2>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-sm border bg-background p-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-mute)]">
              Vía webhook
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {ordersList.filter((o) => o.source === "webhook").length}
            </div>
            <div className="mt-1 text-[10px] text-[var(--color-fg-mute)]">
              Último: hace {timeAgo(lastWebhook ?? null)}
            </div>
          </div>
          <div className="rounded-sm border bg-background p-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-mute)]">
              Rescatadas por cron
            </div>
            <div
              className={`mt-1 text-lg font-semibold tabular-nums ${
                ordersList.filter((o) => o.source === "cron_rescue").length > 0
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-[var(--color-fg)]"
              }`}
            >
              {ordersList.filter((o) => o.source === "cron_rescue").length}
            </div>
            <div className="mt-1 text-[10px] text-[var(--color-fg-mute)]">cada 30 min</div>
          </div>
          <div className="rounded-sm border bg-background p-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-mute)]">
              Manual / retry
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {ordersList.filter((o) => o.source === "manual").length}
            </div>
          </div>
        </div>
      </section>

      {/* Recent orders */}
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold">Últimas órdenes</h2>
        </div>
        {ordersList.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-fg-mute)]">
            No hay órdenes recientes. Esperando webhook PO_CREATED de Marketplace.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-[var(--color-fg-mute)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">PO Number</th>
                  <th className="px-3 py-2 text-left">Origen</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Recibido</th>
                </tr>
              </thead>
              <tbody>
                {ordersList.slice(0, 10).map((o) => (
                  <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2">{stateBadge(o.state)}</td>
                    <td className="px-3 py-2 font-mono">{o.walmart_po_id}</td>
                    <td className="px-3 py-2 text-[var(--color-fg-mute)]">{o.source}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {o.parsed_payload?.totals?.grand_total
                        ? fmtCurrency(o.parsed_payload.totals.grand_total)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-fg-mute)]">
                      hace {timeAgo(o.created_at)}
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

function stateBadge(state: string) {
  const config: Record<string, { cls: string; label: string }> = {
    pending: { cls: "bg-slate-500/10 text-slate-700 dark:text-slate-400", label: "Pendiente" },
    running: { cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", label: "Procesando" },
    downloaded: {
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      label: "Descargado",
    },
    failed: { cls: "bg-red-500/10 text-red-700 dark:text-red-400", label: "Falló" },
    manual_required: {
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      label: "Manual",
    },
  };
  const c = config[state] ?? { cls: "bg-slate-500/10 text-slate-500", label: state };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.cls}`}
    >
      {c.label}
    </span>
  );
}
