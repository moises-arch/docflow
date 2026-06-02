"use client";

import {
  AlertTriangle,
  Clock,
  Download,
  HandHelping,
  Mail,
  Zap,
} from "lucide-react";

type Stats = {
  total: number;
  downloaded: number;
  pending: number;
  failed: number;
  manual_required: number;
  last_downloaded_at: string | null;
  source_breakdown: { email: number; scan_rescue: number };
};

type Props = {
  stats: Stats;
};

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "ok" | "warn" | "error" | "neutral";
}) {
  const colors = {
    ok: "text-emerald-700 dark:text-emerald-400",
    warn: "text-amber-700 dark:text-amber-400",
    error: "text-red-700 dark:text-red-400",
    neutral: "text-[var(--color-fg)]",
  };
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-mute)]">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${colors[tone]}`}>{value}</div>
    </div>
  );
}

export function RithumResumenClient({ stats }: Props) {
  return (
    <div>
      {/* Page header */}
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/connector-logo.svg"
            alt="Supplier Portal OrderStream"
            width={140}
            height={40}
            className="h-10 w-auto"
          />
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Integración activa
          </span>
        </div>
        <p className="mt-1.5 text-sm text-[var(--color-fg-mute)]">
          Resumen general de la integración
        </p>
      </div>

      {/* Content */}
      <div className="px-6 py-6 space-y-6">
        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard
            icon={<Download size={14} />}
            label="Descargados"
            value={stats.downloaded.toString()}
            tone="ok"
          />
          <StatCard
            icon={<Clock size={14} />}
            label="En curso"
            value={stats.pending.toString()}
            tone={stats.pending > 0 ? "warn" : "neutral"}
          />
          <StatCard
            icon={<AlertTriangle size={14} />}
            label="Fallidos"
            value={stats.failed.toString()}
            tone={stats.failed > 0 ? "error" : "neutral"}
          />
          <StatCard
            icon={<HandHelping size={14} />}
            label="Manual"
            value={stats.manual_required.toString()}
            tone={stats.manual_required > 0 ? "warn" : "neutral"}
          />
          <StatCard
            icon={<Zap size={14} />}
            label="Último download"
            value={
              stats.last_downloaded_at
                ? new Date(stats.last_downloaded_at).toLocaleString("es-MX", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "—"
            }
            tone="neutral"
          />
        </div>

        {/* Source breakdown — last 7 days */}
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-2 flex items-center gap-2">
            <Mail size={14} className="text-[var(--color-fg-mute)]" />
            <h3 className="text-sm font-semibold">Origen de las órdenes (últimos 7 días)</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-sm border bg-background p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-mute)]">
                Vía email (camino feliz)
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {stats.source_breakdown.email}
              </div>
            </div>
            <div className="rounded-sm border bg-background p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-mute)]">
                Rescatadas por scan cron
              </div>
              <div
                className={`mt-1 text-lg font-semibold tabular-nums ${
                  stats.source_breakdown.scan_rescue > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-[var(--color-fg)]"
                }`}
              >
                {stats.source_breakdown.scan_rescue}
              </div>
            </div>
          </div>
          {stats.source_breakdown.scan_rescue > 0 && stats.source_breakdown.email === 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠ Todas las órdenes recientes vinieron por scan cron, no por email. Posible
              problema con el trigger por email — verificá <code className="font-mono">orders@example.com</code>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
