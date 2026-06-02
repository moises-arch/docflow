// Dashboard redesign — bento asimétrico, hero metric, anti-card overuse.
// Variance 8 · Motion 6 (CSS fluid) · Density 4.
"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  ArrowRight,
  ArrowUpRight,
  AlertTriangle,
  Upload,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertTitle, AlertDescription, AlertAction } from "@/components/reui/alert";
import { Frame, FramePanel } from "@/components/reui/frame";

export interface DashboardStats {
  uploadedToday: number;
  needsReview: number;
  processedWeek: number;
  creditBalance: number;
  stateCounts: Record<string, number>;
}

export interface ActivityDay {
  date: string;
  count: number;
  label: string;
}

export interface RecentDocument {
  id: string;
  original_name: string;
  state: string;
  created_at: string;
  page_count: number | null;
}

interface DashboardClientProps {
  stats: DashboardStats;
  activity: ActivityDay[];
  recent: RecentDocument[];
  user: { id: string; email: string; name?: string };
}

const STATE_META: Record<string, { tKey: string; color: string }> = {
  uploaded: { tKey: "uploaded", color: "var(--color-fg-subtle)" },
  processing: { tKey: "processing", color: "var(--color-blue)" },
  needs_review: { tKey: "needsReview", color: "var(--color-amber)" },
  failed_processing: { tKey: "failed", color: "var(--color-rose)" },
};

function useRelativeTime() {
  const t = useTranslations("dashboard.time");
  return (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t("justNow");
    if (m < 60) return t("minutesAgo", { n: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t("hoursAgo", { n: h });
    return t("daysAgo", { n: Math.floor(h / 24) });
  };
}

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export function DashboardClient({ stats, activity, recent, user }: DashboardClientProps) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const relativeTime = useRelativeTime();

  const maxActivity = Math.max(...activity.map((d) => d.count), 1);
  const totalInbox = Object.values(stats.stateCounts).reduce((a, b) => a + b, 0);
  const totalState = Object.values(stats.stateCounts).reduce((a, b) => a + b, 0);
  const failedCount = stats.stateCounts["failed_processing"] ?? 0;
  const successRate = totalState > 0 ? Math.round(((totalState - failedCount) / totalState) * 100) : 100;
  const avgDaily =
    activity.length > 0
      ? Math.round(activity.reduce((s, d) => s + d.count, 0) / activity.length)
      : 0;
  const peak = Math.max(...activity.map((d) => d.count), 0);
  const trend =
    activity.length >= 2
      ? activity[activity.length - 1].count - activity[activity.length - 2].count
      : 0;
  const totalWeekDocs = activity.reduce((s, d) => s + d.count, 0);

  const [integrationAlerts, setIntegrationAlerts] = useState<{ cleo_failed: number; rithum_failed: number } | null>(null);

  useEffect(() => {
    fetch("/api/ingest/integration-alerts")
      .then((r) => r.json())
      .then((d) => {
        if ((d.cleo_failed ?? 0) > 0 || (d.rithum_failed ?? 0) > 0) {
          setIntegrationAlerts(d);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div
      className="flex h-full flex-col overflow-y-auto"
      style={{ ["--ease" as string]: EASE }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="shrink-0 px-6 pt-7 pb-5 lg:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold tracking-tight text-[var(--color-fg)] leading-none">
              <Greeting name={user.name ?? user.email.split("@")[0]} />
            </h1>
            <p className="mt-2 text-[13px] text-[var(--color-fg-mute)] tracking-tight">
              <TodayDate />
            </p>
          </div>
          <Link href="/inbox">
            <Button size="sm" className="gap-1.5 mt-1 group">
              <Upload size={13} aria-hidden="true" />
              {t("actions.upload")}
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-5 px-6 pb-8 lg:px-8">
        {/* ── Integration alerts ─────────────────────────────────────────── */}
        {integrationAlerts && (
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-amber-300/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {(integrationAlerts.cleo_failed ?? 0) > 0 && (
                <span>
                  <strong className="tabular-nums">{integrationAlerts.cleo_failed}</strong> orden(es) de Supplier Portal fallaron —{" "}
                  <a href="/ingest/cleo" className="font-medium underline underline-offset-2 hover:no-underline">
                    Ver Supplier Portal
                  </a>
                </span>
              )}
              {(integrationAlerts.rithum_failed ?? 0) > 0 && (
                <span>
                  <strong className="tabular-nums">{integrationAlerts.rithum_failed}</strong> orden(es) de Supplier Portal fallaron —{" "}
                  <a href="/ingest/rithum" className="font-medium underline underline-offset-2 hover:no-underline">
                    Ver Supplier Portal
                  </a>
                </span>
              )}
            </div>
            <button
              type="button"
              className="ml-auto shrink-0 rounded p-1 text-amber-700 transition-colors hover:bg-amber-100/50 hover:text-amber-900 dark:text-amber-400 dark:hover:bg-amber-900/30"
              onClick={() => setIntegrationAlerts(null)}
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Action-required pipeline alerts ─────────────────────────────── */}
        {(stats.needsReview > 0 || failedCount > 0) && (
          <Frame stacked>
            {failedCount > 0 && (
              <FramePanel className="p-0!">
                <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 shadow-none last:border-b-0">
                  <AlertTriangle size={15} />
                  <AlertTitle>
                    {t("alerts.failedTitle", { count: failedCount })}
                  </AlertTitle>
                  <AlertDescription>{t("alerts.failedDesc")}</AlertDescription>
                  <AlertAction>
                    <Link href="/inbox">
                      <Button size="xs" variant="outline">{t("alerts.goToInbox")}</Button>
                    </Link>
                  </AlertAction>
                </Alert>
              </FramePanel>
            )}
            {stats.needsReview > 0 && (
              <FramePanel className="p-0!">
                <Alert variant="warning" className="rounded-none border-x-0 border-t-0 shadow-none last:border-b-0">
                  <AlertTriangle size={15} />
                  <AlertTitle>{t("alerts.needsReviewTitle", { count: stats.needsReview })}</AlertTitle>
                  <AlertDescription>{t("alerts.needsReviewDesc")}</AlertDescription>
                  <AlertAction>
                    <Link href="/review">
                      <Button size="xs">{t("alerts.reviewNow")}</Button>
                    </Link>
                  </AlertAction>
                </Alert>
              </FramePanel>
            )}
          </Frame>
        )}

        {/* ── Bento row 1: Hero metric (7/12) + Pipeline (5/12) ──────────── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <HeroToday
            uploadedToday={stats.uploadedToday}
            needsReview={stats.needsReview}
            processedWeek={stats.processedWeek}
            successRate={successRate}
            t={t}
          />
          <PipelineCard
            stats={stats}
            totalInbox={totalInbox}
            t={t}
            tCommon={tCommon}
          />
        </div>

        {/* ── Bento row 2: Activity chart (8/12) + Quick stats (4/12) ────── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <ActivityChart
            activity={activity}
            maxActivity={maxActivity}
            totalWeekDocs={totalWeekDocs}
            t={t}
          />
          <QuickStats
            avgDaily={avgDaily}
            peak={peak}
            trend={trend}
            successRate={successRate}
            totalProcessed={totalState - failedCount}
            failedCount={failedCount}
            t={t}
          />
        </div>

        {/* ── Recent documents ────────────────────────────────────────────── */}
        <RecentDocs recent={recent} relativeTime={relativeTime} t={t} />
      </div>
    </div>
  );
}

// ── Hero "Today" ─────────────────────────────────────────────────────────────

function HeroToday({
  uploadedToday,
  needsReview,
  processedWeek,
  successRate,
  t,
}: {
  uploadedToday: number;
  needsReview: number;
  processedWeek: number;
  successRate: number;
  t: (k: string, v?: Record<string, string | number | Date>) => string;
}) {
  return (
    <section
      className="group/hero relative lg:col-span-7 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-7 transition-colors duration-300"
      style={{ transitionTimingFunction: "var(--ease)" }}
    >
      {/* Eyebrow */}
      <div className="mb-5 flex items-center gap-2">
        <span
          className="inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--color-blue)]"
          style={{ animation: "pulseSoft 2.4s ease-in-out infinite" }}
          aria-hidden="true"
        />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-mute)]">
          {t("hero.eyebrow")}
        </span>
      </div>

      {/* Massive editorial number */}
      <div className="flex items-baseline gap-4">
        <h2 className="text-[64px] font-semibold tracking-[-0.04em] leading-none text-[var(--color-fg)] tabular-nums">
          {uploadedToday}
        </h2>
        <p className="text-sm text-[var(--color-fg-mute)] max-w-[18ch] leading-snug">
          {uploadedToday === 1 ? t("hero.singular") : t("hero.plural")}
        </p>
      </div>

      {/* Hairline divider + inline secondary metrics */}
      <div className="mt-7 grid grid-cols-3 gap-6 border-t border-[var(--color-border)] pt-5">
        <SecondaryMetric label={t("stats.needsReview")} value={needsReview} href="/review" />
        <SecondaryMetric label={t("stats.processedWeek")} value={processedWeek} href="/processed" />
        <SecondaryMetric label={t("metrics.successRate")} value={`${successRate}%`} accentByRate={successRate} />
      </div>
    </section>
  );
}

function SecondaryMetric({
  label,
  value,
  href,
  accentByRate,
}: {
  label: string;
  value: number | string;
  href?: string;
  accentByRate?: number;
}) {
  const accent =
    accentByRate !== undefined
      ? accentByRate >= 95
        ? "var(--color-teal)"
        : accentByRate >= 80
          ? "var(--color-amber)"
          : "var(--color-rose)"
      : "var(--color-fg)";

  const content = (
    <div className="group/sec flex flex-col gap-1">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[22px] font-semibold tabular-nums leading-none transition-colors duration-200"
          style={{ color: accent }}
        >
          {value}
        </span>
        {href && (
          <ArrowUpRight
            size={12}
            className="opacity-0 -translate-x-0.5 transition-all duration-300 group-hover/sec:opacity-100 group-hover/sec:translate-x-0 text-[var(--color-fg-mute)]"
            style={{ transitionTimingFunction: "var(--ease)" }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

// ── Pipeline card ────────────────────────────────────────────────────────────

function PipelineCard({
  stats,
  totalInbox,
  t,
  tCommon,
}: {
  stats: DashboardStats;
  totalInbox: number;
  t: (k: string, v?: Record<string, string | number | Date>) => string;
  tCommon: (k: string) => string;
}) {
  return (
    <section
      className="lg:col-span-5 flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
    >
      <div className="flex items-end justify-between px-5 pt-5 pb-4">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-mute)]">
            {t("pipeline.title")}
          </p>
          <p className="mt-2 text-[28px] font-semibold tabular-nums leading-none text-[var(--color-fg)] tracking-tight">
            {totalInbox}
            <span className="ml-2 text-xs font-normal text-[var(--color-fg-subtle)] tracking-normal">
              {t("pipeline.totalInbox")}
            </span>
          </p>
        </div>
      </div>
      <div className="flex-1 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
        {Object.entries(STATE_META).map(([state, meta]) => {
          const count = stats.stateCounts[state] ?? 0;
          const pct = totalInbox > 0 ? Math.round((count / totalInbox) * 100) : 0;
          return (
            <div
              key={state}
              className="group/row flex items-center gap-3 px-5 py-3 transition-colors duration-200"
              style={{ transitionTimingFunction: "var(--ease)" }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full transition-transform duration-300 group-hover/row:scale-150"
                style={{
                  background: meta.color,
                  transitionTimingFunction: "var(--ease)",
                }}
                aria-hidden="true"
              />
              <span className="flex-1 text-[13px] text-[var(--color-fg-mute)]">
                {t(`states.${meta.tKey}`)}
              </span>
              <div className="flex items-center gap-3">
                <div className="h-[3px] w-20 overflow-hidden rounded-full bg-[var(--color-surface-mute)]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: meta.color,
                      transitionTimingFunction: "var(--ease)",
                    }}
                  />
                </div>
                <span className="w-6 text-right text-[13px] font-semibold text-[var(--color-fg)] tabular-nums">
                  {count}
                </span>
              </div>
            </div>
          );
        })}
        {totalInbox === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-[var(--color-fg-mute)]">
            {tCommon("noResults")}
          </div>
        )}
      </div>
      <Link
        href="/inbox"
        className="group/link flex items-center gap-1.5 border-t border-[var(--color-border)] px-5 py-3 text-[12px] font-medium text-[var(--color-fg-mute)] transition-colors duration-200 hover:bg-[var(--color-surface-mute)] hover:text-[var(--color-fg)]"
      >
        {t("pipeline.viewInbox")}
        <ArrowRight
          size={12}
          className="transition-transform duration-300 group-hover/link:translate-x-0.5"
          style={{ transitionTimingFunction: "var(--ease)" }}
          aria-hidden="true"
        />
      </Link>
    </section>
  );
}

// ── Activity chart ───────────────────────────────────────────────────────────

function ActivityChart({
  activity,
  maxActivity,
  totalWeekDocs,
  t,
}: {
  activity: ActivityDay[];
  maxActivity: number;
  totalWeekDocs: number;
  t: (k: string, v?: Record<string, string | number | Date>) => string;
}) {
  return (
    <section className="lg:col-span-8 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-end justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-mute)]">
            {t("chart.title")}
          </p>
          <p className="mt-2 text-[22px] font-semibold tabular-nums leading-none text-[var(--color-fg)] tracking-tight">
            {totalWeekDocs}
            <span className="ml-2 text-xs font-normal text-[var(--color-fg-subtle)] tracking-normal">
              {t("chart.totalDocs")}
            </span>
          </p>
        </div>
        <span className="text-[11px] text-[var(--color-fg-subtle)] hidden sm:inline">
          {t("chart.subtitle")}
        </span>
      </div>
      <div className="px-3 pt-4 pb-3">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={activity} barCategoryGap="32%">
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "var(--color-fg-subtle)" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "var(--color-fg-subtle)" }}
              allowDecimals={false}
              width={28}
            />
            <RechartsTooltip
              cursor={{ fill: "var(--color-surface-mute)" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: 12,
                color: "var(--color-fg)",
                boxShadow: "none",
                padding: "6px 10px",
              }}
              itemStyle={{ color: "var(--color-fg)" }}
              labelStyle={{ color: "var(--color-fg-mute)", marginBottom: 2 }}
              formatter={(v) => [v as number, t("chart.docs")]}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {activity.map((entry) => (
                <Cell
                  key={entry.date}
                  fill={
                    entry.count === maxActivity && entry.count > 0
                      ? "var(--color-blue)"
                      : "color-mix(in oklab, var(--color-blue) 14%, transparent)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ── Quick stats (right column of row 2) ──────────────────────────────────────

function QuickStats({
  avgDaily,
  peak,
  trend,
  successRate,
  totalProcessed,
  failedCount,
  t,
}: {
  avgDaily: number;
  peak: number;
  trend: number;
  successRate: number;
  totalProcessed: number;
  failedCount: number;
  t: (k: string, v?: Record<string, string | number | Date>) => string;
}) {
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor =
    trend > 0 ? "var(--color-teal)" : trend < 0 ? "var(--color-rose)" : "var(--color-fg-subtle)";

  return (
    <section className="lg:col-span-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
      <QuickStatRow
        label={t("metrics.dailyThroughput")}
        value={avgDaily}
        sub={t("metrics.dailyThroughputSub", { peak })}
      />
      <QuickStatRow
        label={t("metrics.trend24h")}
        value={
          <span className="inline-flex items-baseline gap-1.5" style={{ color: trendColor }}>
            <TrendIcon size={16} className="self-center" aria-hidden="true" />
            <span className="tabular-nums">
              {trend > 0 ? "+" : trend < 0 ? "−" : ""}
              {Math.abs(trend)}
            </span>
          </span>
        }
        sub={
          trend > 0
            ? t("metrics.trendUp", { n: trend })
            : trend < 0
              ? t("metrics.trendDown", { n: Math.abs(trend) })
              : t("metrics.trendFlat")
        }
      />
      <QuickStatRow
        label={t("metrics.successRate")}
        value={`${successRate}%`}
        sub={t("metrics.successRateSub", { ok: totalProcessed, total: totalProcessed + failedCount })}
        progress={successRate}
      />
    </section>
  );
}

function QuickStatRow({
  label,
  value,
  sub,
  progress,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  progress?: number;
}) {
  return (
    <div className="p-5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-mute)]">
        {label}
      </p>
      <p className="mt-2 text-[26px] font-semibold tabular-nums leading-none text-[var(--color-fg)] tracking-tight">
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 text-[11.5px] text-[var(--color-fg-subtle)]">{sub}</p>
      )}
      {progress !== undefined && (
        <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[var(--color-surface-mute)]">
          <div
            className="h-full rounded-full bg-[color:var(--color-teal)] transition-all duration-700"
            style={{ width: `${progress}%`, transitionTimingFunction: "var(--ease)" }}
          />
        </div>
      )}
    </div>
  );
}

// ── Recent documents ─────────────────────────────────────────────────────────

function RecentDocs({
  recent,
  relativeTime,
  t,
}: {
  recent: RecentDocument[];
  relativeTime: (iso: string) => string;
  t: (k: string, v?: Record<string, string | number | Date>) => string;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-mute)]">
          {t("recent.title")}
        </p>
        <Link
          href="/inbox"
          className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-fg-mute)] transition-colors duration-200 hover:text-[var(--color-fg)]"
        >
          {t("recent.viewAll")}
          <ArrowRight
            size={12}
            className="transition-transform duration-300 group-hover:translate-x-0.5"
            style={{ transitionTimingFunction: "var(--ease)" }}
            aria-hidden="true"
          />
        </Link>
      </div>

      {recent.length === 0 ? (
        <EmptyRecent t={t} />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {recent.map((doc, i) => (
            <div
              key={doc.id}
              className="group/doc flex items-center gap-4 px-5 py-3.5 transition-colors duration-200 hover:bg-[var(--color-surface-mute)]"
              style={{
                transitionTimingFunction: "var(--ease)",
                animation: `fadeUpIn 500ms ${i * 40}ms both var(--ease)`,
              }}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] transition-colors duration-200 group-hover/doc:border-[var(--color-fg-subtle)]">
                <FileText
                  size={14}
                  className="text-[var(--color-fg-mute)]"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-[var(--color-fg)]">
                  {doc.original_name}
                </p>
                <p className="mt-0.5 text-[11.5px] text-[var(--color-fg-subtle)] tabular-nums">
                  {doc.page_count != null ? `${doc.page_count}p · ` : ""}
                  {relativeTime(doc.created_at)}
                </p>
              </div>
              <StatusBadge
                status={doc.state as import("@/components/ui/status-badge").BadgeVariant}
              />
              {doc.state === "needs_review" && (
                <Link
                  href={`/review/${doc.id}`}
                  className={cn(
                    "shrink-0 rounded-[var(--radius-sm)] px-2.5 py-1.5",
                    "text-[11.5px] font-medium text-[var(--color-fg-mute)]",
                    "border border-[var(--color-border)]",
                    "transition-all duration-200 hover:border-[var(--color-fg)] hover:text-[var(--color-fg)] active:translate-y-[1px]",
                  )}
                  style={{ transitionTimingFunction: "var(--ease)" }}
                >
                  {t("recent.review")}
                </Link>
              )}
              {doc.state === "failed_processing" && (
                <AlertTriangle
                  size={14}
                  className="shrink-0 text-[color:var(--color-rose)]"
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeUpIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pulseSoft {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(0.85);
          }
        }
      `}</style>
    </section>
  );
}

function EmptyRecent({ t }: { t: (k: string, v?: Record<string, string | number | Date>) => string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]">
        <FileText size={20} className="text-[var(--color-fg-mute)]" aria-hidden="true" />
      </div>
      <div>
        <p className="text-[14px] font-medium text-[var(--color-fg)]">
          {t("recent.empty.title")}
        </p>
        <p className="mt-1 text-[12.5px] text-[var(--color-fg-mute)] max-w-[42ch] mx-auto">
          {t("recent.empty.subtitle")}
        </p>
      </div>
      <Link href="/inbox">
        <Button size="sm" variant="outline" className="gap-1.5">
          <Upload size={13} aria-hidden="true" />
          {t("actions.upload")}
        </Button>
      </Link>
    </div>
  );
}

// ── Greeting ─────────────────────────────────────────────────────────────────

function Greeting({ name }: { name: string }) {
  const t = useTranslations("dashboard.greeting");
  const hour = new Date().getHours();
  const slot = hour < 12 ? "morning" : hour < 19 ? "afternoon" : "evening";
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  return <>{t(slot, { name: displayName })}</>;
}

function TodayDate() {
  return (
    <>
      {new Date().toLocaleDateString("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })}
    </>
  );
}
