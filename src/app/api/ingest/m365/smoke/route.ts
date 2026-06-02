// Microsoft 365 shallow smoke test (user-callable, no Playwright).
// Checks: env vars + Graph token endpoint + active m365 sources for tenant.
// Returns a JSON status report compatible with the other smoke endpoints.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Check = { name: string; ok: boolean; detail?: string; ms?: number };

function checkEnv(): Check[] {
  const required = [
    "MICROSOFT_GRAPH_TENANT_ID",
    "MICROSOFT_GRAPH_CLIENT_ID",
    "MICROSOFT_GRAPH_CLIENT_SECRET",
  ];
  return required.map((key) => ({
    name: `env_${key.toLowerCase()}`,
    ok: Boolean(process.env[key]),
    detail: process.env[key] ? "set" : "missing",
  }));
}

async function checkGraphToken(): Promise<Check> {
  const start = Date.now();
  const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID;
  const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    return { name: "graph_token", ok: false, detail: "credentials missing", ms: 0 };
  }

  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
          scope: "https://graph.microsoft.com/.default",
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
    const ok = res.ok && Boolean(data.access_token);
    return {
      name: "graph_token",
      ok,
      detail: ok ? "token acquired" : data.error ?? `HTTP ${res.status}`,
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "graph_token",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    };
  }
}

async function checkM365Sources(tenantId: string): Promise<Check> {
  try {
    const svc = createServiceClient();
    const { data, error } = await (svc as unknown as {
      from: (t: string) => {
        select: (q: string) => {
          eq: (k: string, v: string) => Promise<{ data: unknown[]; error: unknown }>;
        };
      };
    })
      .from("m365_sources")
      .select("id")
      .eq("tenant_id", tenantId);

    if (error) throw new Error(String(error));
    const count = (data as unknown[]).length;
    return {
      name: "m365_sources",
      ok: count > 0,
      detail: count > 0 ? `${count} source(s) configured` : "no sources configured",
    };
  } catch (err) {
    return {
      name: "m365_sources",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST() {
  const context = await getTenantContext();
  if ("error" in context) return context.error;

  const tenantId = context.tenantId;

  const envChecks = checkEnv();
  const [tokenCheck, sourcesCheck] = await Promise.all([
    checkGraphToken(),
    checkM365Sources(tenantId),
  ]);

  const checks: Check[] = [...envChecks, tokenCheck, sourcesCheck];
  const ok = checks.every((c) => c.ok);

  // Persist to smoke_runs (best-effort — skip if table doesn't exist)
  try {
    const svc = createServiceClient();
    await (svc as unknown as {
      from: (t: string) => {
        insert: (v: unknown) => Promise<unknown>;
      };
    })
      .from("m365_smoke_runs")
      .insert({ tenant_id: tenantId, ok, checks });
  } catch {
    /* table may not exist — non-blocking */
  }

  return NextResponse.json({ ok, checks });
}
