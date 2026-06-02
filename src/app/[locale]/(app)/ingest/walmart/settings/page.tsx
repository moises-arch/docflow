import { requireSettingsAccess } from "../../../settings/_lib";
import { getWalmartSettings } from "@/lib/walmart/settings";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

type SmokeRun = {
  id: string;
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string; ms?: number }>;
  created_at: string;
};

export default async function SettingsPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const [settings, { data: smokeRuns }] = await Promise.all([
    getWalmartSettings(tenantId),
    supabase
      .from("walmart_smoke_runs")
      .select("id,ok,checks,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<SmokeRun[]>(),
  ]);

  return <SettingsClient settings={settings} smokeRuns={(smokeRuns ?? []) as SmokeRun[]} />;
}
