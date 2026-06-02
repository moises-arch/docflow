// Manual deep-smoke endpoint (called from the dashboard "Smoke test" button).
// The actual logic lives in lib/rithum/health.ts so it can be reused by the
// /api/cron/rithum-healthcheck cron without duplication.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { runRithumDeepSmoke } from "@/lib/rithum/health";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  const result = await runRithumDeepSmoke();

  // Persist for trend tracking
  const svc = createServiceClient();
  await svc.from("rithum_smoke_runs").insert({
    tenant_id: tenantId,
    ok: result.ok,
    checks: result.steps.map((s) => ({
      name: s.name,
      ok: s.ok,
      detail: s.detail ? s.detail.slice(0, 200) : `${s.ms}ms`,
      ms: s.ms,
    })),
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
