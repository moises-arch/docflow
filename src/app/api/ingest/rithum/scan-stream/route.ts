// SSE endpoint para escanear el dashboard de Rithum con logs en tiempo real.
// El cliente abre un fetch POST y lee el ReadableStream línea a línea.
// Cada evento SSE tiene el formato: data: <JSON>\n\n
// Payload de log:  { level, msg, t }
// Payload de fin:  { done: true, result? }

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { runScan } from "../scan-pending/route";
import { type RLog } from "@/lib/rithum/browser";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest) {
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

  void (async () => {
    try {
      const result = await runScan(ctx.tenantId, log);
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
