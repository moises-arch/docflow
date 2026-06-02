import {
  cleanText,
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { runBrowserIngest } from "@/lib/browser-ingest/runner";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type Connection = {
  id: string;
  tenant_id: string;
  provider_id: string | null;
  name: string;
  portal_url: string;
  login_url: string | null;
  selectors: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const context = await getTenantContext();
  if ("error" in context) return context.error;
  const { supabase, tenantId } = context;
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { connection_id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const connectionId = cleanText(body.connection_id);
  if (!connectionId) return NextResponse.json({ error: "Missing connection_id" }, { status: 422 });

  const db = supabase as unknown as DynamicSupabaseClient;
  const { data: connectionData, error: connectionError } = await db
    .from<Connection[]>("browser_ingest_connections")
    .select("id, tenant_id, provider_id, name, portal_url, login_url, selectors, settings")
    .eq("id", connectionId)
    .eq("tenant_id", tenantId)
    .not("status", "eq", "archived")
    .single();
  const connection = Array.isArray(connectionData)
    ? connectionData[0]
    : (connectionData as Connection | null);

  if (connectionError || !connection) {
    return NextResponse.json(
      { error: connectionError?.message ?? "Connection not found" },
      { status: 404 },
    );
  }

  const { data: runData, error: runError } = await db
    .from<Array<{ id: string }>>("browser_ingest_runs")
    .insert({
      tenant_id: tenantId,
      connection_id: connection.id,
      provider_id: connection.provider_id,
      triggered_by: user.id,
      trigger_type: "manual",
      state: "queued",
    })
    .select("id")
    .single();
  const run = Array.isArray(runData) ? runData[0] : (runData as { id: string } | null);

  if (runError || !run) {
    return NextResponse.json({ error: runError?.message ?? "Run create failed" }, { status: 500 });
  }

  try {
    const result = await runBrowserIngest({
      runId: run.id,
      tenantId,
      userId: user.id,
      connection,
    });
    return NextResponse.json({
      id: run.id,
      state: result.state,
      documents_created: result.documentsCreated,
      artifacts_created: result.artifacts.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portal capture failed";
    return NextResponse.json({ id: run.id, error: message }, { status: 500 });
  }
}
