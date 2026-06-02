import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { emitWorkflowEvent } from "../_shared/events.ts";
import { secrets } from "../_shared/secrets.ts";

interface IngestPayload {
  document_id?: string;
  tenant_id?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const startedAt = performance.now();
  const runId = crypto.randomUUID();

  let payload: IngestPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { document_id: documentId, tenant_id: tenantId } = payload;
  if (!validUuid(documentId) || !validUuid(tenantId)) {
    return json({ error: "Invalid document_id or tenant_id" }, 400);
  }

  const supabase = createServiceClient();

  try {
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id, tenant_id, state")
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (documentError) {
      throw new Error(`Failed to load document ${documentId}: ${documentError.message}`);
    }
    if (!document) return json({ error: "Document not found" }, 404);

    if (document.state === "needs_review") {
      return json({ ok: true, run_id: runId, skipped: "already_processed" });
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({
        state: "processing",
        processing_run_id: runId,
        last_error: null,
      })
      .eq("id", documentId)
      .eq("tenant_id", tenantId);

    if (updateError) {
      throw new Error(`Failed to update document state to processing: ${updateError.message}`);
    }

    await emitWorkflowEvent({
      tenantId,
      documentId,
      runId,
      stage: "ingest",
      outcome: "ok",
      durationMs: Math.round(performance.now() - startedAt),
      meta: { state: "processing" },
    });

    const aiResponse = await fetch(`${secrets.supabaseUrl}/functions/v1/ai-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secrets.supabaseServiceKey}`,
      },
      body: JSON.stringify({ document_id: documentId, tenant_id: tenantId, run_id: runId }),
    });

    if (!aiResponse.ok) {
      const message = await aiResponse.text();
      throw new Error(`ai-process failed: ${message}`);
    }

    return json({ ok: true, run_id: runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingest error";

    await supabase
      .from("documents")
      .update({ state: "failed_processing", last_error: message.slice(0, 500) })
      .eq("id", documentId)
      .eq("tenant_id", tenantId);

    await emitWorkflowEvent({
      tenantId,
      documentId,
      runId,
      stage: "ingest",
      outcome: "fail",
      durationMs: Math.round(performance.now() - startedAt),
      errorCode: "ingest_failed",
      meta: { message },
    });

    return json({ error: "ingest_failed" }, 500);
  }
});
