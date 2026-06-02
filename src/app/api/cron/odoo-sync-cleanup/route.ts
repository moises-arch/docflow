// Marca runs stuck (finished_at=null y started_at > 10 min atrás) como fallidos.
// Schedule: */10 * * * *

import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

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
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data, error } = await svc
    .from("odoo_sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      ok: false,
      error: "timeout: run did not finish within 10min",
    })
    .is("finished_at", null)
    .lt("started_at", tenMinutesAgo)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cleaned: data?.length ?? 0 });
}
