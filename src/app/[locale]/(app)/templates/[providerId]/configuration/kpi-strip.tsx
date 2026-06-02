import { createClient } from "@/lib/supabase/server";
import { Activity, BadgeAlert, FileCheck2, Gauge, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

interface KpiStripProps {
  providerId: string;
  tenantId: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_DAYS = 14;

export async function KpiStrip({ providerId, tenantId }: KpiStripProps) {
  const supabase = await createClient();
  const t = await getTranslations("settings.providers.kpis");
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY_MS).toISOString();
  const sinceActivity = new Date(now - ACTIVITY_DAYS * DAY_MS).toISOString();

  const [docs30dResult, needsReviewResult, syncResult, confResult, activityResult] =
    await Promise.all([
      supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("provider_id", providerId)
        .gte("created_at", since30),
      supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("provider_id", providerId)
        .eq("state", "needs_review"),
      supabase
        .from("order_drafts")
        .select("sync_state")
        .eq("tenant_id", tenantId)
        .eq("provider_id", providerId),
      supabase
        .from("extractions")
        .select("confidence, documents!inner(provider_id, tenant_id)")
        .eq("documents.tenant_id", tenantId)
        .eq("documents.provider_id", providerId)
        .gte("created_at", since30),
      supabase
        .from("documents")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .eq("provider_id", providerId)
        .gte("created_at", sinceActivity),
    ]);

  const syncRows = (syncResult.data ?? []) as { sync_state: string }[];
  const synced = syncRows.filter((r) => r.sync_state === "synced").length;
  const failed = syncRows.filter((r) => r.sync_state === "sync_failed").length;
  const syncDenom = synced + failed;
  const syncRate = syncDenom > 0 ? synced / syncDenom : null;

  const confRows = (confResult.data ?? []) as { confidence: number | null }[];
  const confValues = confRows.map((r) => r.confidence).filter((v): v is number => v != null);
  const avgConfidence =
    confValues.length > 0 ? confValues.reduce((a, b) => a + b, 0) / confValues.length : null;

  const activityRows = (activityResult.data ?? []) as { created_at: string }[];
  const buckets = new Map<string, number>();
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of activityRows) {
    const k = r.created_at.slice(0, 10);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  const activity = Array.from(buckets.entries()).map(([day, count]) => ({ day, count }));
  const maxBucket = Math.max(1, ...activity.map((a) => a.count));
  const totalActivity = activity.reduce((a, b) => a + b.count, 0);

  const docs30d = docs30dResult.count ?? 0;
  const needsReview = needsReviewResult.count ?? 0;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(280px,1.4fr)]">
      <Stat
        icon={FileCheck2}
        label={t("docs30d")}
        value={String(docs30d)}
        bg="bg-blue-950"
        accent="bg-blue-400/20 text-blue-300"
        sub={t("last30days")}
      />
      <Stat
        icon={BadgeAlert}
        label={t("needsReview")}
        value={String(needsReview)}
        bg={needsReview > 0 ? "bg-rose-950" : "bg-zinc-900"}
        accent={needsReview > 0 ? "bg-rose-400/20 text-rose-300" : "bg-zinc-700 text-zinc-400"}
        sub={needsReview > 0 ? t("needsAttention") : t("upToDate")}
      />
      <Stat
        icon={Workflow}
        label={t("syncSuccess")}
        value={syncRate == null ? "—" : `${Math.round(syncRate * 100)}%`}
        bg={syncRate != null && syncRate < 0.8 ? "bg-amber-950" : "bg-emerald-950"}
        accent={syncRate != null && syncRate < 0.8 ? "bg-amber-400/20 text-amber-300" : "bg-emerald-400/20 text-emerald-300"}
        sub={syncDenom > 0 ? t("syncOf", { synced, total: syncDenom }) : t("noAttempts")}
      />
      <Stat
        icon={Gauge}
        label={t("confidence")}
        value={avgConfidence == null ? "—" : `${Math.round(avgConfidence * 100)}%`}
        bg="bg-violet-950"
        accent="bg-violet-400/20 text-violet-300"
        sub={t("avg30d")}
      />
      <ActivityCard activity={activity} max={maxBucket} total={totalActivity} documentsLabel={t("documents")} activityLabel={t("activity")} />
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  bg,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  bg: string;
  accent: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-[var(--radius-md)] p-4", bg)}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">{label}</p>
        <span className={cn("grid size-7 place-items-center rounded-[var(--radius-sm)]", accent)}>
          <Icon size={13} aria-hidden="true" />
        </span>
      </div>
      <p className="text-3xl leading-none font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-white/40">{sub}</p>}
    </div>
  );
}

function ActivityCard({
  activity, max, total, documentsLabel, activityLabel,
}: {
  activity: { day: string; count: number }[];
  max: number;
  total: number;
  documentsLabel: string;
  activityLabel: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">
          {activityLabel}
        </p>
        <span className="grid size-7 place-items-center rounded-[var(--radius-sm)] bg-white/10 text-white/60">
          <Activity size={13} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl leading-none font-bold text-white tabular-nums">{total}</p>
        <p className="text-[11px] text-white/40">{documentsLabel}</p>
      </div>
      <div className="mt-4 flex h-10 items-end gap-[3px]">
        {activity.map((bucket) => {
          const h = max > 0 ? Math.max(8, Math.round((bucket.count / max) * 100)) : 8;
          return (
            <div
              key={bucket.day}
              title={`${bucket.day}: ${bucket.count}`}
              className={cn(
                "flex-1 rounded-sm transition-all",
                bucket.count > 0 ? "bg-blue-400" : "bg-white/10",
              )}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
