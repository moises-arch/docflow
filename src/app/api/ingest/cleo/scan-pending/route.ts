// Scan for orphan Cleo notification emails — those received BEFORE the email
// detector was deployed, or that arrived during a temporary failure. Identifies
// HTML documents in the Inbox that originate from Cleo notifications, parses
// the embedded EDI table, dispatches a Cleo job for each 850, and archives
// the orphan HTML document.
import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { runCleoJob, cleoRLog0, type CleoRLog } from "@/lib/cleo/runner";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const CLEO_HEADERS = [
  "Date",
  "Time",
  "Document",
  "Interchange",
  "Control",
  "Reference",
  "Message",
  "Batch Id",
];

function isCleoNotification(html: string): boolean {
  for (const h of CLEO_HEADERS) {
    if (!html.includes(`<th>${h}</th>`)) return false;
  }
  return true;
}

type CleoRow = {
  document: string;
  reference: string;
  messageId: string;
  batchId: string;
};

function parseCleoTable(html: string): CleoRow[] {
  const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) ?? [];
  const dataTable = tables.find((t) => t.includes("<th>Message</th>"));
  if (!dataTable) return [];
  const rows = dataTable.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const out: CleoRow[] = [];
  for (const row of rows) {
    if (row.includes("<th>")) continue;
    const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) =>
      m[1].replace(/<[^>]+>/g, "").trim(),
    );
    if (cells.length < 8) continue;
    out.push({
      document: cells[2],
      reference: cells[5],
      messageId: cells[6],
      batchId: cells[7],
    });
  }
  return out;
}

function tradingPartnerFromSubject(subject: string | null): string | null {
  if (!subject) return null;
  const m = subject.match(/Arrival of data from\s+(.+?)\s*-\s*\d+\s*$/i);
  return m?.[1]?.trim() ?? null;
}

type DocRow = {
  id: string;
  original_name: string;
  source_meta: Record<string, unknown> | null;
};

type EmailRow = {
  id: string;
  subject: string | null;
  from_email: string;
  html_storage_path: string | null;
  meta: Record<string, unknown> | null;
};

export type CleoScanSummary = {
  candidates: number;
  cleo_detected: number;
  dispatched: number;
  archived: number;
  skipped: number;
  errors: Array<{ doc_id: string; reason: string }>;
};

export async function runCleoScan(
  tenantId: string,
  log: CleoRLog = cleoRLog0,
  documentIds: string[] | null = null,
): Promise<CleoScanSummary> {
  const svc = createServiceClient();
  const db = svc as unknown as DynamicSupabaseClient;

  log("info", "Buscando notificaciones Cleo en el inbox...");

  // 1. Find candidate HTML email-source documents still in inbox states
  let q = db
    .from<DocRow>("documents")
    .select("id, original_name, source_meta")
    .eq("tenant_id", tenantId)
    .eq("source_channel", "email")
    .eq("mime_type", "text/html")
    .in("state", ["uploaded", "processing", "needs_review"]);
  if (documentIds) {
    q = q.in("id", documentIds);
  }
  const { data: docs } = await q;
  const docList = (Array.isArray(docs) ? docs : []) as DocRow[];

  log("info", `Encontrados ${docList.length} documentos candidatos`);

  const summary: CleoScanSummary = {
    candidates: docList.length,
    cleo_detected: 0,
    dispatched: 0,
    archived: 0,
    skipped: 0,
    errors: [],
  };

  for (const doc of docList) {
    const inboundId = (doc.source_meta ?? {}).inbound_email_id as string | undefined;
    if (!inboundId) {
      summary.skipped += 1;
      continue;
    }

    // Get the email to retrieve html storage path + subject
    const { data: emailData } = await db
      .from<EmailRow>("inbound_emails")
      .select("id, subject, from_email, html_storage_path, meta")
      .eq("id", inboundId)
      .eq("tenant_id", tenantId)
      .single();
    const email = Array.isArray(emailData) ? emailData[0] : (emailData as EmailRow | null);
    if (!email || !email.html_storage_path) {
      summary.skipped += 1;
      continue;
    }

    // Download HTML from Storage
    const { data: blob, error: dlError } = await svc.storage
      .from("documents")
      .download(email.html_storage_path);
    if (dlError || !blob) {
      summary.errors.push({ doc_id: doc.id, reason: dlError?.message ?? "html_download_failed" });
      continue;
    }
    const html = await blob.text();

    if (!isCleoNotification(html)) {
      summary.skipped += 1;
      continue;
    }
    summary.cleo_detected += 1;

    const rows = parseCleoTable(html);
    log("info", `${summary.cleo_detected} notificaciones Cleo detectadas`);
    const tradingPartner = tradingPartnerFromSubject(email.subject);
    let dispatchedFromThisEmail = 0;
    for (const row of rows) {
      if (row.document !== "850" || !row.messageId) continue;
      log("info", `→ Ref ${row.reference || row.messageId}: despachando...`);
      const result = await runCleoJob(
        {
          tenant_id: tenantId,
          inbound_email_id: email.id,
          cleo_message_id: row.messageId,
          cleo_reference: row.reference,
          cleo_batch_id: row.batchId,
          trading_partner: tradingPartner,
          subject: email.subject,
          from_email: email.from_email,
        },
        log,
      );
      if (result.ok) {
        dispatchedFromThisEmail += 1;
        summary.dispatched += 1;
      } else {
        summary.errors.push({ doc_id: doc.id, reason: result.reason });
      }
    }

    // Archive the orphan HTML document — Cleo PDFs replace it
    if (dispatchedFromThisEmail > 0) {
      await db
        .from("documents")
        .update({ state: "archived", last_error: "cleo_notification_html_orphan" })
        .eq("id", doc.id);
      summary.archived += 1;
    }
  }

  log(
    "ok",
    `✓ ${summary.dispatched} órdenes procesadas, ${summary.archived} archivadas`,
  );

  return summary;
}

export async function POST(req: Request) {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  // Optional: caller can scope to specific document IDs (per-row button or
  // bulk-selected rows). If omitted, we scan ALL eligible HTML email docs.
  let documentIds: string[] | null = null;
  try {
    const body = (await req.json().catch(() => null)) as
      | { document_ids?: string[] }
      | null;
    if (body && Array.isArray(body.document_ids) && body.document_ids.length > 0) {
      documentIds = body.document_ids.filter((id) => typeof id === "string");
    }
  } catch {
    /* ignore — body is optional */
  }

  const summary = await runCleoScan(tenantId, cleoRLog0, documentIds);
  return NextResponse.json(summary);
}
