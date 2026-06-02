/**
 * Shared implementation of the "retry batch" handler used by Cleo and Rithum
 * ingest pipelines. Both routes share the same shape:
 *
 *   1. Find all rows in `<channel>_orders` where state='failed' for this tenant
 *   2. Mark them as state='pending' (in one UPDATE)
 *   3. Kick the channel worker via fetch() in `after()` so the response returns
 *      immediately with the queued count
 *
 * Previously this lived as two near-duplicate route handlers. Any bug fix had
 * to be applied twice. This factoring keeps each route as a thin shim.
 */
import { after } from "next/server";
import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { NextRequest, NextResponse } from "next/server";

type ChannelConfig = {
  /** Either "cleo_orders" or "rithum_orders" — must match the table name. */
  table: "cleo_orders" | "rithum_orders";
  /** URL path of the worker route, relative to the deployment host. */
  workerPath: string;
  /** Header name the worker expects for internal auth. */
  internalTokenHeader: string;
  /** Env var holding the internal auth token. */
  internalTokenEnv: "INTAKE_CLEO_INTERNAL_TOKEN" | "INTAKE_RITHUM_INTERNAL_TOKEN";
  /** Channel name used in logs. */
  channelName: "cleo" | "rithum";
};

type RetryBatchDb = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => Promise<{ data: Array<{ id: string }> | null }>;
      };
    };
    update: (v: Record<string, unknown>) => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => Promise<unknown>;
      };
    };
  };
};

export async function handleRetryBatch(req: NextRequest, cfg: ChannelConfig) {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as RetryBatchDb;

  const { data: failed } = await db
    .from(cfg.table)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("state", "failed");

  const count = (failed ?? []).length;
  if (count === 0) {
    return NextResponse.json({ queued: 0 }, { status: 200 });
  }

  await db
    .from(cfg.table)
    .update({ state: "pending", last_error: null })
    .eq("tenant_id", tenantId)
    .eq("state", "failed");

  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "app.example.com";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;

  // IMPORTANTE: after() debe recibir una función async que retorne la promesa.
  // void fetch() sin return hace que after() crea que terminó y corta la ejecución.
  after(async () => {
    await fetch(`${baseUrl}${cfg.workerPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [cfg.internalTokenHeader]: process.env[cfg.internalTokenEnv] ?? "",
      },
      body: JSON.stringify({ tenant_id: tenantId }),
      // Sin timeout — el worker puede tardar hasta 5 min procesando todas las órdenes
    }).catch((err) =>
      console.error(`[${cfg.channelName}/retry-batch] worker kick failed:`, err),
    );
  });

  return NextResponse.json({ queued: count }, { status: 202 });
}
