import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  DashboardClient,
  type DashboardStats,
  type ActivityDay,
  type RecentDocument,
} from "@/components/app/dashboard-client";

export const dynamic = "force-dynamic";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const locale = await getLocale();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/sign-in`);

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) redirect(`/${locale}/select-tenant`);

  const tenantId = membership.tenant_id;
  const today = startOfToday();
  const week = daysAgo(7);

  const [
    { count: uploadedToday },
    { count: needsReview },
    { count: processedWeek },
    { data: creditRows },
    { data: recentDocs },
    { data: activityDocs },
    { data: stateRows },
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", today),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("state", "needs_review"),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("state", "processed")
      .gte("updated_at", week),
    supabase.from("credit_ledger").select("amount").eq("tenant_id", tenantId),
    supabase
      .from("documents")
      .select("id, original_name, state, created_at, page_count")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("documents")
      .select("created_at, state")
      .eq("tenant_id", tenantId)
      .gte("created_at", week)
      .order("created_at", { ascending: true }),
    supabase
      .from("documents")
      .select("state")
      .eq("tenant_id", tenantId)
      .in("state", ["uploaded", "processing", "needs_review", "failed_processing"]),
  ]);

  const creditBalance = (creditRows ?? []).reduce((sum, r) => sum + r.amount, 0);

  // Build 7-day activity
  const dayMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayMap[d.toLocaleDateString("en-CA")] = 0;
  }
  for (const doc of activityDocs ?? []) {
    const day = new Date(doc.created_at).toLocaleDateString("en-CA");
    if (day in dayMap) dayMap[day]++;
  }
  const activity: ActivityDay[] = Object.entries(dayMap).map(([date, count]) => ({
    date,
    count,
    label: new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }),
  }));

  // State breakdown
  const stateCounts: Record<string, number> = {};
  for (const r of stateRows ?? []) {
    stateCounts[r.state] = (stateCounts[r.state] ?? 0) + 1;
  }

  const stats: DashboardStats = {
    uploadedToday: uploadedToday ?? 0,
    needsReview: needsReview ?? 0,
    processedWeek: processedWeek ?? 0,
    creditBalance,
    stateCounts,
  };

  const recent: RecentDocument[] = (recentDocs ?? []).map((r) => ({
    id: r.id,
    original_name: r.original_name,
    state: r.state,
    created_at: r.created_at,
    page_count: r.page_count,
  }));

  const userData = {
    id: user.id,
    email: user.email ?? "",
    name: (user.user_metadata?.full_name as string | undefined) ?? undefined,
  };

  return <DashboardClient stats={stats} activity={activity} recent={recent} user={userData} />;
}
