// SSE: procesa TODAS las órdenes failed/pending en cola, streamea logs al UI.
// El usuario ve en tiempo real qué pasa con cada orden (login, navegación,
// descarga, parsing). Si una falla, ve el error específico y continúa con
// la siguiente. Reemplaza el patrón con after()+chaining que era frágil.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { runCleoJob, type CleoRLog } from "@/lib/cleo/runner";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type OrderRow = {
  id: string;
  cleo_message_id: string;
  cleo_reference: string | null;
  cleo_batch_id: string | null;
  trading_partner: string | null;
  inbound_email_id: string | null;
};

type DynClient = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: string) => {
        in: (c: string, vs: string[]) => {
          order: (c: string, opts: { ascending: boolean }) => Promise<{ data: OrderRow[] | null }>;
        };
      };
    };
    update: (v: Record<string, unknown>) => {
      eq: (c: string, v: string) => {
        in: (c: string, vs: string[]) => Promise<unknown>;
      };
    };
  };
};

export async function POST(_req: NextRequest) {
  const ctx = await getTenantContext();
  if ("error" in ctx) {
    return new Response(`data: ${JSON.stringify({ error: "auth" })}\n\n`, {
      headers: { "Content-Type": "text/event-stream" },
      status: 401,
    });
  }
  const { tenantId } = ctx;
  const supabase = createServiceClient();
  const db = supabase as unknown as DynClient;

  const encoder = new TextEncoder();
  const ref: { ctrl: ReadableStreamDefaultController<Uint8Array> | null } = { ctrl: null };

  const emit = (data: object) => {
    if (!ref.ctrl) return;
    try {
      ref.ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {}
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) { ref.ctrl = c; },
    cancel() { ref.ctrl = null; },
  });

  const log = (level: "info" | "ok" | "warn" | "error", msg: string) =>
    emit({ level, msg, t: new Date().toLocaleTimeString("es-MX") });

  void (async () => {
    try {
      // 1. Buscar todas las failed/pending para este tenant
      const { data: queue } = await db
        .from("cleo_orders")
        .select("id,cleo_message_id,cleo_reference,cleo_batch_id,trading_partner,inbound_email_id")
        .eq("tenant_id", tenantId)
        .in("state", ["failed", "pending"])
        .order("created_at", { ascending: true });

      const orders = queue ?? [];
      if (orders.length === 0) {
        log("warn", "No hay órdenes para reintentar");
        emit({ done: true, succeeded: 0, failed: 0 });
        return;
      }

      log("info", `Cola: ${orders.length} órden(es) a procesar`);

      // 2. Marcar todas como pending
      await db
        .from("cleo_orders")
        .update({ state: "pending", last_error: null })
        .eq("tenant_id", tenantId)
        .in("id", orders.map((o) => o.id));

      let succeeded = 0;
      let failed = 0;
      const startedAt = Date.now();
      const WALL_MS = 260_000;

      // 3. Procesar una por una con logs en vivo
      for (let i = 0; i < orders.length; i++) {
        if (Date.now() - startedAt > WALL_MS) {
          log("warn", `Tiempo agotado tras ${i}/${orders.length} órdenes — el resto queda en pending`);
          break;
        }

        const order = orders[i];
        log("info", `━━━ [${i + 1}/${orders.length}] ${order.cleo_message_id} (${order.trading_partner ?? "?"}) ━━━`);

        const orderLog: CleoRLog = (level, msg) => {
          emit({ level, msg: `  ${msg}`, t: new Date().toLocaleTimeString("es-MX") });
        };

        try {
          const result = await runCleoJob(
            {
              tenant_id: tenantId,
              inbound_email_id: order.inbound_email_id,
              cleo_message_id: order.cleo_message_id,
              cleo_reference: order.cleo_reference ?? "",
              cleo_batch_id: order.cleo_batch_id ?? "",
              trading_partner: order.trading_partner,
              subject: null,
              from_email: "",
            },
            orderLog,
          );

          if (result.ok) {
            succeeded++;
            log("ok", `✓ ${order.cleo_message_id} descargado (${Math.round(result.size_bytes / 1024)} KB)`);
          } else {
            failed++;
            log("error", `✗ ${order.cleo_message_id} falló: ${result.reason.slice(0, 200)}`);
          }
        } catch (err) {
          failed++;
          log("error", `✗ ${order.cleo_message_id} crash: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      log("info", `━━━ Fin: ${succeeded} OK, ${failed} fallidos ━━━`);
      emit({ done: true, succeeded, failed });
    } catch (err) {
      log("error", `worker crash: ${err instanceof Error ? err.message : String(err)}`);
      emit({ done: true });
    } finally {
      try { ref.ctrl?.close(); } catch {}
      ref.ctrl = null;
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
