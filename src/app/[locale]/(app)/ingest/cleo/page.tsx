import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { requireSettingsAccess } from "../../settings/_lib";
import type { CleoSmokeRun } from "./cleo-dashboard-client";
import { CleoResumenClient } from "./cleo-resumen-client";

export default async function CleoIngestPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const db = supabase as unknown as DynamicSupabaseClient;

  type OrderRow = { id: string; cleo_message_id: string; state: string; updated_at: string };
  type SmokeRow = { id: string; ok: boolean; checks: CleoSmokeRun["checks"]; created_at: string };

  const [{ data: orders }, { data: smokeRuns }] = await Promise.all([
    db
      .from<OrderRow>("cleo_orders")
      .select("id,cleo_message_id,state,updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from<SmokeRow>("cleo_smoke_runs")
      .select("id,ok,checks,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const ordersList = (Array.isArray(orders) ? orders : []) as OrderRow[];

  const stats = {
    total: ordersList.length,
    downloaded: ordersList.filter((o) => o.state === "downloaded").length,
    pending: ordersList.filter((o) => o.state === "pending" || o.state === "running").length,
    failed: ordersList.filter((o) => o.state === "failed").length,
    last_downloaded_at:
      ordersList.filter((o) => o.state === "downloaded").map((o) => o.updated_at).sort().pop() ?? null,
  };

  return (
    <CleoResumenClient
      stats={stats}
      smokeRuns={(smokeRuns ?? []) as CleoSmokeRun[]}
    />
  );
}
