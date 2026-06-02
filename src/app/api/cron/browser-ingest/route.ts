import { runBrowserIngest } from "@/lib/browser-ingest/runner";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type DynamicDb = {
  from: (table: string) => QueryBuilder;
};

type QueryBuilder = PromiseLike<{ data: unknown; error: { message?: string } | null }> & {
  select: (columns?: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  not: (column: string, operator: string, value: unknown) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  insert: (values: unknown) => QueryBuilder;
  single: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

type Connection = {
  id: string;
  tenant_id: string;
  provider_id: string | null;
  created_by: string | null;
  name: string;
  portal_url: string;
  login_url: string | null;
  selectors: Record<string, unknown>;
  settings: Record<string, unknown>;
};

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: if no secret is configured, reject all requests. Previously
  // this returned `true`, which meant a missing env var silently disabled auth.
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient() as unknown as DynamicDb;
  const { data, error } = await service
    .from("browser_ingest_connections")
    .select(
      "id, tenant_id, provider_id, created_by, name, portal_url, login_url, selectors, settings",
    )
    .eq("schedule_enabled", true)
    .eq("status", "active")
    .not("created_by", "is", null)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(1);

  const connection = Array.isArray(data) ? (data[0] as Connection | undefined) : undefined;
  if (error)
    return NextResponse.json(
      { error: error.message ?? "Connection query failed" },
      { status: 500 },
    );
  if (!connection?.created_by) return NextResponse.json({ ok: true, skipped: true });

  const { data: runData, error: runError } = await service
    .from("browser_ingest_runs")
    .insert({
      tenant_id: connection.tenant_id,
      connection_id: connection.id,
      provider_id: connection.provider_id,
      triggered_by: null,
      trigger_type: "cron",
      state: "queued",
    })
    .select("id")
    .single();

  const run = runData as { id?: string } | null;
  if (runError || !run?.id) {
    return NextResponse.json({ error: runError?.message ?? "Run create failed" }, { status: 500 });
  }

  try {
    const result = await runBrowserIngest({
      runId: run.id,
      tenantId: connection.tenant_id,
      userId: connection.created_by,
      connection,
    });
    return NextResponse.json({
      ok: true,
      id: run.id,
      state: result.state,
      documents_created: result.documentsCreated,
      artifacts_created: result.artifacts.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portal capture failed";
    return NextResponse.json({ ok: false, id: run.id, error: message }, { status: 500 });
  }
}
