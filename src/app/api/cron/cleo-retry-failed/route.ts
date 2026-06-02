// Cron que reintenta automáticamente órdenes Cleo fallidas.
// Corre cada 15 min, toma hasta 5 órdenes con state='failed' y attempts < 3,
// las procesa secuencialmente. Si tras 3 intentos sigue fallando, envía
// admin alert y deja la orden en 'failed' permanente (requiere intervención).
//
// Garantiza que ninguna orden nueva quede sin procesarse — si falla en el
// primer intento (por login lento, rate limit transitorio, etc.) se
// reintenta sola sin que el usuario tenga que tocar nada.

import { sendAdminAlert } from "@/lib/email/admin-alert";
import { createServiceClient } from "@/lib/supabase/service";
import { runCleoJob } from "@/lib/cleo/runner";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 5;
const WALL_MS = 260_000;

type OrderRow = {
  id: string;
  tenant_id: string;
  cleo_message_id: string;
  cleo_reference: string | null;
  cleo_batch_id: string | null;
  trading_partner: string | null;
  inbound_email_id: string | null;
  attempts: number;
  last_error: string | null;
};

type DynClient = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: string) => {
        lt: (c: string, v: number) => {
          order: (c: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: OrderRow[] | null }>;
          };
        };
      };
    };
    update: (v: Record<string, unknown>) => {
      eq: (c: string, v: string) => Promise<unknown>;
    };
  };
};

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

async function runRetry() {
  const supabase = createServiceClient();
  const db = supabase as unknown as DynClient;

  // 1. Rescatar órdenes atascadas en "running" o "pending" > 15 min.
  //    Si Playwright crasheó o Vercel hizo OOM, la orden queda atascada.
  //    Resetearla a "failed" la hace elegible para retry en este mismo ciclo.
  const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  try {
    const stuckClient = supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          in: (c: string, vs: string[]) => {
            lt: (c: string, v: string) => Promise<unknown>;
          };
        };
      };
    };
    await stuckClient
      .from("cleo_orders")
      .update({ state: "failed", last_error: "stuck_reset_by_janitor" })
      .in("state", ["running", "pending"])
      .lt("updated_at", stuckCutoff);
  } catch (err) {
    console.error("[cleo-retry-failed] stuck reset failed:", err);
  }

  // 2. Tomar órdenes fallidas con attempts < MAX_ATTEMPTS, las más viejas primero
  const { data: failed } = await db
    .from("cleo_orders")
    .select("id,tenant_id,cleo_message_id,cleo_reference,cleo_batch_id,trading_partner,inbound_email_id,attempts,last_error")
    .eq("state", "failed")
    .lt("attempts", MAX_ATTEMPTS)
    .order("updated_at", { ascending: true })
    .limit(BATCH_SIZE);

  const orders = failed ?? [];
  if (orders.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  let succeeded = 0;
  let failedCount = 0;
  const startedAt = Date.now();
  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];

  for (const order of orders) {
    if (Date.now() - startedAt > WALL_MS) break;

    // Marcar running antes de procesar
    await db
      .from("cleo_orders")
      .update({ state: "running" })
      .eq("id", order.id);

    const result = await runCleoJob({
      tenant_id: order.tenant_id,
      inbound_email_id: order.inbound_email_id,
      cleo_message_id: order.cleo_message_id,
      cleo_reference: order.cleo_reference ?? "",
      cleo_batch_id: order.cleo_batch_id ?? "",
      trading_partner: order.trading_partner,
      subject: null,
      from_email: "",
    });

    if (result.ok) {
      succeeded++;
      results.push({ id: order.cleo_message_id, ok: true });
    } else {
      failedCount++;
      results.push({ id: order.cleo_message_id, ok: false, reason: result.reason });
      // Si esta era la última oportunidad (attempts ahora = MAX_ATTEMPTS), alertar admin
      // (attempts se incrementa dentro de runCleoJob antes del fallo)
      if (order.attempts + 1 >= MAX_ATTEMPTS) {
        await sendAdminAlert(
          `Cleo: orden ${order.cleo_message_id} falló ${MAX_ATTEMPTS} veces`,
          `Trading partner: ${order.trading_partner ?? "?"}\n` +
            `Reference: ${order.cleo_reference ?? "?"}\n` +
            `Último error: ${result.reason}\n` +
            `Tenant: ${order.tenant_id}\n\n` +
            `Requiere intervención manual desde el historial de Cleo.`,
        ).catch((err) => console.error("admin alert failed:", err));
      }
    }
  }

  return { processed: results.length, succeeded, failed: failedCount, skipped: 0, results };
}

async function handle(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runRetry();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cleo-retry-failed]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
