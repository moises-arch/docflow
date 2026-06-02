// SSE version of manual-dispatch — streams logs en tiempo real al terminal del UI.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { runCleoJob, type CleoRLog } from "@/lib/cleo/runner";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ("error" in ctx) {
    return new Response(`data: ${JSON.stringify({ error: "auth" })}\n\n`, {
      headers: { "Content-Type": "text/event-stream" },
      status: 401,
    });
  }
  const { tenantId } = ctx;

  let body: { message_id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response(`data: ${JSON.stringify({ error: "invalid_json" })}\n\n`, {
      headers: { "Content-Type": "text/event-stream" },
      status: 400,
    });
  }

  const messageId = typeof body.message_id === "string" ? body.message_id.trim() : "";
  if (!messageId) {
    return new Response(`data: ${JSON.stringify({ error: "message_id requerido" })}\n\n`, {
      headers: { "Content-Type": "text/event-stream" },
      status: 422,
    });
  }

  const encoder = new TextEncoder();
  const ref: { ctrl: ReadableStreamDefaultController<Uint8Array> | null } = { ctrl: null };

  const emit = (data: object) => {
    if (!ref.ctrl) return;
    try { ref.ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) { ref.ctrl = c; },
    cancel() { ref.ctrl = null; },
  });

  const log: CleoRLog = (level, msg) =>
    emit({ level, msg, t: new Date().toLocaleTimeString("es-MX") });

  void (async () => {
    try {
      const result = await runCleoJob(
        {
          tenant_id: tenantId,
          inbound_email_id: null,
          cleo_message_id: messageId,
          cleo_reference: "",
          cleo_batch_id: "",
          trading_partner: null,
          subject: "manual-rescue",
          from_email: "manual@docflow",
        },
        log,
      );
      emit({ done: true, result });
    } catch (err) {
      log("error", err instanceof Error ? err.message : String(err));
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
