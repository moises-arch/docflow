// Daily catalog sync — invoca la edge function odoo-sync-products por cada tenant.
// Cron: 0 7 * * * (3am ET / 2am CT) — ventana de baja actividad.

import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    .returns<Array<{ id: string }>>();

  if (!tenants?.length) {
    return NextResponse.json({ error: "no_tenants" }, { status: 422 });
  }

  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/odoo-sync-products`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!edgeFnUrl || !serviceKey) {
    return NextResponse.json({ error: "missing_supabase_env" }, { status: 500 });
  }

  const results: Array<{ tenant_id: string; ok: boolean; status: number; body?: unknown }> = [];

  for (const tenant of tenants) {
    try {
      const edgeRes = await fetch(edgeFnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ tenant_id: tenant.id }),
      });
      const body = (await edgeRes.json().catch(() => ({}))) as Record<string, unknown>;
      results.push({ tenant_id: tenant.id, ok: edgeRes.ok, status: edgeRes.status, body });
    } catch (err) {
      results.push({
        tenant_id: tenant.id,
        ok: false,
        status: 0,
        body: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ ok: allOk, processed: results.length, results });
}
