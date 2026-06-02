// SSE endpoint para reintentar una orden Rithum con logs en tiempo real.
// Similar a scan-stream pero llama a runRithumJob directamente con la orden
// recuperada de Supabase por ID.

import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { runRithumJob } from "@/lib/rithum/runner";
import { type RLog } from "@/lib/rithum/browser";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getTenantContext();
  if ("error" in ctx) {
    return new Response(
      `data: ${JSON.stringify({ error: "auth" })}\n\n`,
      {
        headers: { "Content-Type": "text/event-stream" },
        status: 401,
      },
    );
  }

  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  type RithumOrder = {
    id: string;
    rithum_order_number: string;
    rithum_partner: string | null;
    inbound_email_id: string | null;
    state: string;
  };

  const { data, error } = await db
    .from<RithumOrder>("rithum_orders")
    .select("id, rithum_order_number, rithum_partner, inbound_email_id, state")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  const order = Array.isArray(data) ? data[0] : (data as RithumOrder | null);

  if (error || !order) {
    return new Response(
      `data: ${JSON.stringify({ error: "not_found" })}\n\n`,
      {
        headers: { "Content-Type": "text/event-stream" },
        status: 404,
      },
    );
  }

  // Marcar como pending antes de arrancar
  await db
    .from("rithum_orders")
    .update({ state: "pending", last_error: null })
    .eq("id", order.id);

  const encoder = new TextEncoder();
  const ref: { ctrl: ReadableStreamDefaultController<Uint8Array> | null } = { ctrl: null };

  const emit = (data: object) => {
    if (!ref.ctrl) return;
    try {
      ref.ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      // stream cerrado — ignorar
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ref.ctrl = c;
    },
    cancel() {
      ref.ctrl = null;
    },
  });

  const log: RLog = (level, msg) =>
    emit({ level, msg, t: new Date().toLocaleTimeString("es-MX") });

  // Resolver el partner PID heurísticamente desde el nombre del partner.
  const partnerLower = (order.rithum_partner ?? "").toLowerCase();
  const partnerPid = partnerLower.includes("home depot special")
    ? "thdso"
    : partnerLower.includes("home depot")
      ? "thehomedepot"
      : partnerLower.includes("walmart")
        ? "walmartmp"
        : null;

  void (async () => {
    try {
      const result = await runRithumJob(
        {
          tenant_id: tenantId,
          inbound_email_id: order.inbound_email_id,
          rithum_order_number: order.rithum_order_number,
          rithum_partner: order.rithum_partner ?? "",
          rithum_partner_pid: partnerPid,
          rithum_order_date: null,
          subject: null,
          from_email: "",
        },
        log,
      );
      emit({ done: true, result });
    } catch (err) {
      log("error", err instanceof Error ? err.message : String(err));
      emit({ done: true });
    } finally {
      try {
        ref.ctrl?.close();
      } catch {
        // ya cerrado
      }
      ref.ctrl = null;
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
