// Walmart shallow smoke test (no Playwright, no full login flow).
// Checks env vars + token endpoint + DB tables + dispatch route.
// For deep smoke (real Auth0 + dashboard), use the cron healthcheck.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { getAccessToken, _resetTokenCacheForTesting } from "@/lib/walmart/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Check = { name: string; ok: boolean; detail?: string; ms?: number };

function checkEnv(): Check[] {
  const required = [
    "WALMART_CLIENT_ID",
    "WALMART_CLIENT_SECRET",
    "INTAKE_WALMART_INTERNAL_TOKEN",
    "INTAKE_PUBLIC_APP_URL",
  ];
  return required.map((key) => ({
    name: `env_${key.toLowerCase()}`,
    ok: Boolean(process.env[key]),
    detail: process.env[key] ? "set" : "missing",
  }));
}

async function checkToken(): Promise<Check> {
  const start = Date.now();
  try {
    _resetTokenCacheForTesting();
    const token = await getAccessToken();
    return {
      name: "walmart_token",
      ok: Boolean(token && token.length > 50),
      detail: token ? `len=${token.length}` : "empty",
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "walmart_token",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    };
  }
}

async function checkDbTables(): Promise<Check[]> {
  const svc = createServiceClient();
  // The cast lets us pass dynamic table names; runtime is unaffected.
  const dynSvc = svc as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        limit: (n: number) => Promise<{ error: { message?: string } | null }>;
      };
    };
  };
  // Tables that use `id` as PK → select("id")
  // walmart_tenant_settings uses `tenant_id` as PK (no id column)
  const tables: Array<{ name: string; pk: string }> = [
    { name: "walmart_orders",               pk: "id" },
    { name: "walmart_smoke_runs",           pk: "id" },
    { name: "walmart_items",               pk: "id" },
    { name: "walmart_inventory_snapshots", pk: "id" },
    { name: "walmart_returns",             pk: "id" },
    { name: "walmart_performance_snapshots", pk: "id" },
    { name: "walmart_buybox_snapshots",    pk: "id" },
    { name: "walmart_tenant_settings",     pk: "tenant_id" },
  ];
  const results: Check[] = [];
  for (const { name: t, pk } of tables) {
    const start = Date.now();
    const { error } = await dynSvc.from(t).select(pk).limit(1);
    results.push({
      name: `db_${t}`,
      ok: !error,
      detail: error?.message ?? "ok",
      ms: Date.now() - start,
    });
  }
  return results;
}

async function checkDispatch(): Promise<Check> {
  const start = Date.now();
  const url = `${process.env.INTAKE_PUBLIC_APP_URL ?? ""}/api/ingest/walmart/process`;
  if (!url.startsWith("http")) {
    return { name: "dispatch_route", ok: false, detail: "INTAKE_PUBLIC_APP_URL not set" };
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8000),
    });
    return {
      name: "dispatch_route",
      ok: r.status === 401, // expected: unauthorized
      detail: `HTTP ${r.status} (expect 401)`,
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "dispatch_route",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    };
  }
}

export async function POST() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  const checks: Check[] = [];
  checks.push(...checkEnv());
  checks.push(await checkToken());
  checks.push(...(await checkDbTables()));
  checks.push(await checkDispatch());

  const ok = checks.every((c) => c.ok);
  const summary = { ok, ran_at: new Date().toISOString(), checks };

  await createServiceClient().from("walmart_smoke_runs").insert({
    tenant_id: tenantId,
    ok,
    checks: summary.checks,
  });

  return NextResponse.json(summary, { status: ok ? 200 : 503 });
}
