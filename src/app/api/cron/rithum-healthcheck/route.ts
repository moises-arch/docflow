// Rithum healthcheck cron — runs every 6h via Vercel Cron.
// Executes the deep smoke (real Auth0 login + dashboard verification) and
// persists each run in rithum_smoke_runs for trend tracking on the dashboard.
//
// Auth: Vercel Cron sends Authorization: Bearer <CRON_SECRET>.

import { createServiceClient } from "@/lib/supabase/service";
import { runRithumDeepSmoke } from "@/lib/rithum/health";
import { createNotification } from "@/lib/notifications/create";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const { data: tenants } = await svc
    .from("tenants")
    .select("id")
    .limit(1)
    .returns<Array<{ id: string }>>();
  const tenantId = tenants?.[0]?.id ?? null;

  const result = await runRithumDeepSmoke();

  if (tenantId) {
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

    if (!result.ok) {
      const firstFailed = result.steps.find((s) => !s.ok);
      const description = firstFailed?.detail
        ? firstFailed.detail.slice(0, 200)
        : "Un paso del healthcheck falló";
      await createNotification({
        tenantId,
        source: "healthcheck",
        severity: "error",
        title: "Rithum healthcheck falló",
        description,
        href: "/ingest/rithum/salud",
      });
    }
  }

  return NextResponse.json(
    {
      ok: result.ok,
      ran_at: new Date().toISOString(),
      step_count: result.steps.length,
      failed_count: result.steps.filter((s) => !s.ok).length,
    },
    { status: result.ok ? 200 : 503 },
  );
}
