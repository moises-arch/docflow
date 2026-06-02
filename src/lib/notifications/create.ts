import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";

export type NotificationSource = "workflow_event" | "odoo_sync" | "healthcheck" | "admin";
export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface CreateNotificationInput {
  tenantId: string;
  source: NotificationSource;
  sourceId?: string | null;
  severity: NotificationSeverity;
  title: string;
  description?: string | null;
  href?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Inserta una notification. Usado por healthchecks y admin actions.
 * Para workflow_events y odoo_sync_runs hay triggers SQL — no llamar desde ahí.
 * Un fallo aquí NO debe romper el flujo del caller (best-effort, log y seguir).
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("notifications").insert({
    tenant_id: input.tenantId,
    source: input.source,
    source_id: input.sourceId ?? null,
    severity: input.severity,
    title: input.title,
    description: input.description ?? null,
    href: input.href ?? null,
    meta: (input.meta ?? {}) as Json,
  });
  if (error) {
    console.error("[notifications.create] failed:", error.message);
  }
}
