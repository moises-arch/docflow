import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { requireSettingsAccess } from "../../../settings/_lib";
import type { RithumSmokeRun } from "../rithum-dashboard-client";
import { RithumSaludClient } from "./rithum-salud-client";
import { getBrowserMode } from "@/lib/browser-mode";

export default async function RithumSaludPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const db = supabase as unknown as DynamicSupabaseClient;

  type SmokeRow = {
    id: string;
    ok: boolean;
    checks: Array<{ name: string; ok: boolean; detail?: string; ms?: number }>;
    created_at: string;
  };

  const { data: smokeRuns } = await db
    .from<SmokeRow>("rithum_smoke_runs")
    .select("id, ok, checks, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <RithumSaludClient
      smokeRuns={(smokeRuns ?? []) as RithumSmokeRun[]}
      browserMode={getBrowserMode()}
    />
  );
}
