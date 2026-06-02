// Reporte diario 2x/día:
//   0 13 * * * UTC = 8am Panamá (UTC-5) → período: medianoche a 8am
//   0 20 * * * UTC = 3pm Panamá          → período: 8am a 3pm

import { createServiceClient } from "@/lib/supabase/service";
import { buildAndSendDigest } from "@/lib/email/digest-notifications";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function getPeriod(now: Date): { from: Date; to: Date; label: string } {
  const h = now.getUTCHours();
  const toDate = new Date(now);
  toDate.setUTCMinutes(0, 0, 0);

  const dateLabel = now.toLocaleDateString("es-PA", {
    timeZone: "America/Panama",
    year: "numeric", month: "long", day: "numeric",
  });

  if (h === 13) {
    // 8am Panama: medianoche Panamá (5am UTC) → 8am Panamá (13:00 UTC)
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 0, 0));
    return { from, to: toDate, label: `12:00 AM – 8:00 AM, ${dateLabel}` };
  }
  // 3pm Panama: 8am Panamá (13:00 UTC) → 3pm Panamá (20:00 UTC)
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0));
  return { from, to: toDate, label: `8:00 AM – 3:00 PM, ${dateLabel}` };
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
  const { data: tenants } = await svc.from("tenants").select("id").returns<Array<{ id: string }>>();

  if (!tenants?.length) return NextResponse.json({ ok: true, tenants: 0 });

  const now = new Date();
  const period = getPeriod(now);
  const results: Array<{ tenantId: string; ok: boolean; error?: string }> = [];

  for (const tenant of tenants) {
    try {
      await buildAndSendDigest({
        tenantId: tenant.id,
        periodFrom: period.from,
        periodTo: period.to,
        periodLabel: period.label,
      });
      results.push({ tenantId: tenant.id, ok: true });
    } catch (err) {
      results.push({
        tenantId: tenant.id, ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, period: period.label, results });
}
