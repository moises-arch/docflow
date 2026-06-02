import { createServiceClient } from "./supabase.ts";

interface WorkflowEventPayload {
  tenantId: string;
  documentId?: string;
  runId?: string;
  stage: string;
  outcome: "ok" | "retry" | "fail";
  durationMs?: number;
  errorCode?: string;
  meta?: Record<string, unknown>;
}

/**
 * Emit a structured workflow event.
 * Never include PII (PO text, buyer names, line items) in meta.
 */
export async function emitWorkflowEvent(payload: WorkflowEventPayload) {
  const supabase = createServiceClient();

  const { error } = await supabase.from("workflow_events").insert({
    tenant_id: payload.tenantId,
    document_id: payload.documentId ?? null,
    run_id: payload.runId ?? null,
    stage: payload.stage,
    outcome: payload.outcome,
    duration_ms: payload.durationMs ?? null,
    error_code: payload.errorCode ?? null,
    meta: payload.meta ?? {},
  });

  if (error) {
    console.error("[emitWorkflowEvent] failed to insert:", error.message);
  }
}
