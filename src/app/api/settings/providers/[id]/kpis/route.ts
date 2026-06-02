import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface ProviderKpis {
  docs30d: number;
  needsReview: number;
  syncRate: number | null;
  avgConfidence: number | null;
  activity: { day: string; count: number }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_DAYS = 14;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }
  const tenantId = membership.tenant_id;
  const { id: providerId } = await params;

  const now = Date.now();
  const since30 = new Date(now - 30 * DAY_MS).toISOString();
  const sinceActivity = new Date(now - ACTIVITY_DAYS * DAY_MS).toISOString();

  const [
    docs30dResult,
    needsReviewResult,
    syncCounts,
    confidenceResult,
    activityResult,
  ] = await Promise.all([
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
      .select("confidence, document_id, documents!inner(provider_id, tenant_id)")
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

  // Sync rate: synced / (synced + sync_failed)
  const syncRows = (syncCounts.data ?? []) as { sync_state: string }[];
  const synced = syncRows.filter((r) => r.sync_state === "synced").length;
  const failed = syncRows.filter((r) => r.sync_state === "sync_failed").length;
  const syncDenom = synced + failed;
  const syncRate = syncDenom > 0 ? synced / syncDenom : null;

  // Avg confidence
  const confRows = (confidenceResult.data ?? []) as { confidence: number | null }[];
  const validConf = confRows.map((r) => r.confidence).filter((v): v is number => v != null);
  const avgConfidence =
    validConf.length > 0 ? validConf.reduce((a, b) => a + b, 0) / validConf.length : null;

  // Activity buckets (UTC days)
  const activityRows = (activityResult.data ?? []) as { created_at: string }[];
  const buckets = new Map<string, number>();
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, 0);
  }
  for (const r of activityRows) {
    const key = r.created_at.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const activity = Array.from(buckets.entries()).map(([day, count]) => ({ day, count }));

  const payload: ProviderKpis = {
    docs30d: docs30dResult.count ?? 0,
    needsReview: needsReviewResult.count ?? 0,
    syncRate,
    avgConfidence,
    activity,
  };

  return NextResponse.json(payload);
}
