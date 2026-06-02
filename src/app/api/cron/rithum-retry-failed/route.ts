// Cron que reintenta órdenes Rithum fallidas o stuck-pending/running.
// Corre cada 15 min. Idéntico al cleo-retry-failed.
// Stuck-running/pending >15 min → reset a failed → elegibles para retry.

import { runRithumJob } from "@/lib/rithum/runner";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 5;
const WALL_MS = 260_000;

type OrderRow = {
  id: string;
  tenant_id: string;
  rithum_order_number: string;
  rithum_partner: string | null;
  rithum_partner_pid: string | null;
  rithum_order_date: string | null;
  inbound_email_id: string;
  attempts: number;
};

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

function partnerPid(partner: string | null): "thehomedepot" | "thdso" | "walmartmp" | null {
  const p = (partner ?? "").toLowerCase();
  if (p.includes("home depot special")) return "thdso";
  if (p.includes("home depot")) return "thehomedepot";
  if (p.includes("walmart")) return "walmartmp";
  return null;
}

async function handle(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // createServiceClient no se usa directamente — fetch REST API es más confiable
  // en cron routes por el TypeScript type casting


  // 1. Resetear órdenes atascadas en running/pending >15 min.
  //    Si la última vez también fue stuck_reset_by_janitor → manual_required
  //    (dos timeouts seguidos = el portal o las credenciales tienen un problema
  //    estructural que no se resuelve reintentando).
  const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const supabaseUrlEarly = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKeyEarly = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrlEarly && serviceKeyEarly) {
    try {
      // Primer PATCH: las que ya habían sido stuck antes → manual_required
      await fetch(
        `${supabaseUrlEarly}/rest/v1/rithum_orders?state=in.(running,pending)&updated_at=lt.${encodeURIComponent(stuckCutoff)}&last_error=eq.stuck_reset_by_janitor`,
        {
          method: "PATCH",
          headers: {
            apikey: serviceKeyEarly, Authorization: `Bearer ${serviceKeyEarly}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ state: "manual_required", last_error: "timeout_repeated" }),
        },
      );
      // Segundo PATCH: primer timeout → failed (elegible para retry normal)
      await fetch(
        `${supabaseUrlEarly}/rest/v1/rithum_orders?state=in.(running,pending)&updated_at=lt.${encodeURIComponent(stuckCutoff)}`,
        {
          method: "PATCH",
          headers: {
            apikey: serviceKeyEarly, Authorization: `Bearer ${serviceKeyEarly}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ state: "failed", last_error: "stuck_reset_by_janitor" }),
        },
      );
    } catch (err) {
      console.error("[rithum-retry-failed] stuck reset failed:", err);
    }
  }

  // 2. Retry órdenes failed con attempts < MAX_ATTEMPTS
  // Usar fetch directo a la REST API — el tipo cast DynClient puede fallar
  // silenciosamente en algunos contextos de Vercel.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Missing Supabase config" }, { status: 500 });
  }

  const qRes = await fetch(
    `${supabaseUrl}/rest/v1/rithum_orders?state=eq.failed&attempts=lt.${MAX_ATTEMPTS}&order=updated_at.asc&limit=${BATCH_SIZE}&select=id,tenant_id,rithum_order_number,rithum_partner,rithum_partner_pid,rithum_order_date,inbound_email_id,attempts`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );

  const orders: OrderRow[] = qRes.ok ? ((await qRes.json()) as OrderRow[]) : [];
  console.log(`[rithum-retry-failed] found ${orders.length} orders to retry`);
  if (orders.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, succeeded: 0, failed: 0 });
  }

  let succeeded = 0;
  let failedCount = 0;
  const startedAt = Date.now();

  for (const order of orders) {
    if (Date.now() - startedAt > WALL_MS) break;

    await fetch(
      `${supabaseUrl}/rest/v1/rithum_orders?id=eq.${order.id}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state: "running" }),
      },
    );

    const result = await runRithumJob({
      tenant_id: order.tenant_id,
      inbound_email_id: order.inbound_email_id,
      rithum_order_number: order.rithum_order_number,
      rithum_partner: order.rithum_partner ?? "",
      rithum_partner_pid: partnerPid(order.rithum_partner),
      rithum_order_date: order.rithum_order_date,
      subject: null,
      from_email: "",
    });

    if (result.ok) succeeded++;
    else failedCount++;
  }

  return NextResponse.json({ ok: true, processed: orders.length, succeeded, failed: failedCount });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
