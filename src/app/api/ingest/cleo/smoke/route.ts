// Cleo WebEDI smoke test. Verifies:
//   1. Env vars present (CLEO_USERNAME, CLEO_PASSWORD, INTAKE_CLEO_INTERNAL_TOKEN)
//   2. Cleo portal reachable (HTTP HEAD/GET to webedi.cleo.com)
//   3. Edge Function dispatch path is wired (INTAKE_PUBLIC_APP_URL)
// Returns a JSON status report. Persists the result to cleo_smoke_runs for
// trend tracking and surfaced on the dashboard.
import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Check = { name: string; ok: boolean; detail?: string; ms?: number };

async function checkPortalReachable(): Promise<Check> {
  const start = Date.now();
  try {
    const r = await fetch("https://webedi.cleo.com/webedi/", {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
    });
    return {
      name: "portal_reachable",
      ok: r.status < 500,
      detail: `HTTP ${r.status}`,
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "portal_reachable",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    };
  }
}

function checkEnv(): Check[] {
  const required = [
    "CLEO_USERNAME",
    "CLEO_PASSWORD",
    "INTAKE_CLEO_INTERNAL_TOKEN",
    "INTAKE_PUBLIC_APP_URL",
  ];
  return required.map((key) => ({
    name: `env_${key.toLowerCase()}`,
    ok: Boolean(process.env[key]),
    detail: process.env[key] ? "set" : "missing",
  }));
}

async function checkRunnerSelfDispatch(): Promise<Check> {
  // Hit the runner's auth gate without a real job — verifies the Vercel
  // route is alive and rejects unauthenticated calls (status 401 is "good").
  const start = Date.now();
  const url = `${process.env.INTAKE_PUBLIC_APP_URL ?? ""}/api/ingest/cleo/process`;
  if (!url.startsWith("http")) {
    return { name: "runner_dispatch", ok: false, detail: "INTAKE_PUBLIC_APP_URL not set" };
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8000),
    });
    return {
      name: "runner_dispatch",
      ok: r.status === 401, // expected: unauthorized when no token sent
      detail: `HTTP ${r.status} (expect 401)`,
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "runner_dispatch",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    };
  }
}

async function checkRunnerEnv(): Promise<Check> {
  // Critical: the smoke test endpoint and the runner endpoint can run in
  // DIFFERENT serverless instances. The smoke test seeing env vars set
  // does NOT prove the runner sees them too (we hit this exact case once).
  // Ask the runner itself via dry_run to verify env presence in ITS instance.
  const start = Date.now();
  const baseUrl = process.env.INTAKE_PUBLIC_APP_URL;
  const token = process.env.INTAKE_CLEO_INTERNAL_TOKEN;
  if (!baseUrl || !token) {
    return {
      name: "runner_env_check",
      ok: false,
      detail: "INTAKE_PUBLIC_APP_URL or INTAKE_CLEO_INTERNAL_TOKEN missing",
    };
  }
  try {
    const r = await fetch(`${baseUrl}/api/ingest/cleo/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cleo-internal-token": token },
      body: JSON.stringify({ dry_run: true }),
      signal: AbortSignal.timeout(10000),
    });
    const body = (await r.json().catch(() => null)) as
      | { ok?: boolean; env?: Record<string, boolean> }
      | null;
    if (r.ok && body?.ok) {
      return {
        name: "runner_env_check",
        ok: true,
        detail: "all env present in runner instance",
        ms: Date.now() - start,
      };
    }
    const missing = body?.env
      ? Object.entries(body.env)
          .filter(([, v]) => !v)
          .map(([k]) => k)
          .join(", ")
      : "unknown";
    return {
      name: "runner_env_check",
      ok: false,
      detail: `HTTP ${r.status} missing=${missing || "none"}`,
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "runner_env_check",
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
  checks.push(await checkPortalReachable());
  checks.push(await checkRunnerSelfDispatch());
  checks.push(await checkRunnerEnv());

  const ok = checks.every((c) => c.ok);
  const summary = {
    ok,
    ran_at: new Date().toISOString(),
    checks,
  };

  // Persist for trend tracking
  const svc = createServiceClient() as unknown as DynamicSupabaseClient;
  await svc
    .from("cleo_smoke_runs")
    .insert({
      tenant_id: tenantId,
      ok,
      checks: summary.checks,
    })
    .select("id")
    .single();

  return NextResponse.json(summary, { status: ok ? 200 : 503 });
}
