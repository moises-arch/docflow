// src/lib/email/digest-notifications.ts

import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "./send";
import { renderDailyDigestEmail, interpolateDigestVars, type DigestError } from "./templates/daily-digest";

const DEFAULT_SUBJECT = "DocFlow · {{period}} — {{total_count}} docs ({{approval_rate}}% aprobadas)";
const DEFAULT_INTRO = "Resumen del período: documentos procesados, estado de sincronización con Odoo y alertas pendientes.";

/**
 * Construye y envía el digest diario para un tenant.
 * Best-effort — no throw.
 */
export async function buildAndSendDigest(params: {
  tenantId: string;
  periodFrom: Date;
  periodTo: Date;
  periodLabel: string;
}): Promise<void> {
  const svc = createServiceClient();
  const { tenantId, periodFrom, periodTo, periodLabel } = params;

  const fromIso = periodFrom.toISOString();
  const toIso = periodTo.toISOString();

  const [approvedRes, pendingRes, failedRes] = await Promise.all([
    svc.from("order_drafts").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("sync_state", "synced")
      .gte("updated_at", fromIso).lte("updated_at", toIso),
    svc.from("order_drafts").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).in("sync_state", ["none", "pending", "in_progress"])
      .gte("updated_at", fromIso).lte("updated_at", toIso),
    svc.from("order_drafts").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("sync_state", "sync_failed")
      .gte("updated_at", fromIso).lte("updated_at", toIso),
  ]);

  const approvedCount = approvedRes.count ?? 0;
  const pendingCount = pendingRes.count ?? 0;
  const failedCount = failedRes.count ?? 0;

  const { data: errorsRaw } = await svc
    .from("notifications")
    .select("title, description, created_at")
    .eq("tenant_id", tenantId).eq("severity", "error")
    .gte("created_at", fromIso).lte("created_at", toIso)
    .order("created_at", { ascending: false }).limit(20)
    .returns<Array<{ title: string; description: string | null; created_at: string }>>();

  const errors: DigestError[] = (errorsRaw ?? []).map((e) => ({
    title: e.title, description: e.description, created_at: e.created_at,
  }));

  const { data: tmpl } = await svc
    .from("email_templates")
    .select("subject, intro")
    .eq("tenant_id", tenantId).eq("type", "daily_digest").maybeSingle();

  const rawSubject = (tmpl?.subject as string | null) ?? DEFAULT_SUBJECT;
  const rawIntro = (tmpl?.intro as string | null) ?? DEFAULT_INTRO;

  const digestData = { period: periodLabel, approvedCount, pendingCount, failedCount, errors, subject: "", intro: "" };
  digestData.subject = interpolateDigestVars(rawSubject, digestData);
  digestData.intro = interpolateDigestVars(rawIntro, digestData);

  const { data: recipients } = await svc
    .from("email_recipients")
    .select("email")
    .eq("tenant_id", tenantId).eq("active", true)
    .in("type", ["daily_digest", "all"]);

  const emails = (recipients ?? []).map((r) => r.email as string);
  if (emails.length === 0) return;

  const { html, text } = renderDailyDigestEmail(digestData);
  await sendEmail({ to: emails, subject: digestData.subject, html, text });
}
