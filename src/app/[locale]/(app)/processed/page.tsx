import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ProcessedTableClient, type ProcessedRow } from "./processed-table-client";

export const dynamic = "force-dynamic";

interface ProcessedDocument {
  id: string;
  doc_number?: string | null;
  original_name: string;
  state: string;
  storage_path: string | null;
  updated_at: string;
  source_channel: string | null;
  source_meta: Record<string, unknown> | null;
}

interface ProcessedDraft {
  id: string;
  document_id: string;
  po_number: string | null;
  po_date: string | null;
  currency: string | null;
  buyer: { name?: string } | null;
  total: number | null;
  sync_state: string;
  approved_at: string | null;
  odoo_so_id: number | null;
  odoo_so_name: string | null;
  last_sync_error: string | null;
  updated_at: string;
  providers: { name: string } | null;
}

const PROCESSING_GRACE_WINDOW_MS = 10 * 60 * 1000;

function shouldKeepProcessedRow(row: ProcessedRow) {
  // Keep only truly processed records:
  // - always keep archived/rejected
  // - keep sync_failed so the user can retry from Processed (not sent back to inbox)
  // - hide "none" (document has no draft, nothing to show)
  // - keep pending/in_progress only during a 10-minute grace window
  if (row.documentState === "archived" || row.documentState === "rejected") return true;
  if (row.syncState === "synced") return true;
  if (row.syncState === "sync_failed") return true; // always show so user can retry
  if (row.syncState === "none") return false;

  if (row.syncState === "pending" || row.syncState === "in_progress") {
    const ageMs = Date.now() - new Date(row.approvedAt).getTime();
    return ageMs <= PROCESSING_GRACE_WINDOW_MS;
  }

  return false;
}

export default async function ProcessedPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = await getTranslations("processed");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    redirect(`/${locale}/select-tenant`);
  }

  const tenantId = membership.tenant_id;

  const { data: documents } = await supabase
    .from("documents")
    .select("id, doc_number, original_name, state, storage_path, updated_at, source_channel, source_meta")
    .eq("tenant_id", tenantId)
    .in("state", ["reviewed", "rejected", "archived"])
    .order("updated_at", { ascending: false })
    .limit(100)
    .returns<ProcessedDocument[]>();

  const documentIds = (documents ?? []).map((document) => document.id);
  const [{ data: drafts }, { data: extractions }] = documentIds.length
    ? await Promise.all([
        supabase
          .from("order_drafts")
          .select(
            "id, document_id, po_number, po_date, currency, buyer, total, sync_state, approved_at, odoo_so_id, odoo_so_name, last_sync_error, updated_at, providers(name)",
          )
          .eq("tenant_id", tenantId)
          .in("document_id", documentIds)
          .returns<ProcessedDraft[]>(),
        supabase
          .from("extractions")
          .select("document_id, payload")
          .eq("tenant_id", tenantId)
          .in("document_id", documentIds)
          .returns<{ document_id: string; payload: unknown }[]>(),
      ])
    : [{ data: [] as ProcessedDraft[] }, { data: [] as { document_id: string; payload: unknown }[] }];

  const draftsByDocumentId = new Map((drafts ?? []).map((draft) => [draft.document_id, draft]));

  // Map: document_id -> ai_usage.actual_cost_usd extracted from payload
  function readAiCost(raw: unknown): number | null {
    if (!raw || typeof raw !== "object") return null;
    const ai = (raw as Record<string, unknown>).ai_usage;
    if (!ai || typeof ai !== "object") return null;
    const cost = (ai as Record<string, unknown>).actual_cost_usd;
    return typeof cost === "number" && Number.isFinite(cost) ? cost : null;
  }
  const costByDocumentId = new Map<string, number | null>(
    (extractions ?? []).map((e) => [e.document_id, readAiCost(e.payload)]),
  );

  // Build set of PO numbers that are already synced to ERP
  const syncedPoNumbers = new Set(
    (drafts ?? [])
      .filter((d) => d.sync_state === "synced" && d.po_number)
      .map((d) => d.po_number!),
  );

  const rows: ProcessedRow[] = (documents ?? [])
    .map((document) => {
      const draft = draftsByDocumentId.get(document.id);
      const syncState = document.state === "rejected" ? "rejected" : (draft?.sync_state ?? "none");

      const meta = (document.source_meta ?? {}) as Record<string, unknown>;
      const inboundEmailId =
        typeof meta.inbound_email_id === "string" ? meta.inbound_email_id : null;
      const poNumber = draft?.po_number ?? null;
      const isPoDuplicate =
        poNumber !== null &&
        syncedPoNumbers.has(poNumber) &&
        draft?.sync_state !== "synced";

      return {
        documentId: document.id,
        docNumber: document.doc_number ?? null,
        documentState: document.state,
        draftId: draft?.id ?? null,
        documentName: document.original_name,
        hasFile: Boolean(document.storage_path),
        poNumber,
        customerName: draft?.buyer?.name ?? draft?.providers?.name ?? null,
        total: draft?.total ?? null,
        currency: draft?.currency ?? null,
        approvedAt: draft?.approved_at ?? document.updated_at,
        syncState,
        syncUpdatedAt: draft?.updated_at ?? null,
        odooSoId: draft?.odoo_so_id ?? null,
        odooSoName: draft?.odoo_so_name ?? null,
        lastSyncError: draft?.last_sync_error ?? null,
        aiCostUsd: costByDocumentId.get(document.id) ?? null,
        sourceChannel: document.source_channel ?? null,
        sourceMeta: meta,
        inboundEmailId,
        isPoDuplicate,
      };
    })
    .filter(shouldKeepProcessedRow);

  return (
    <div className="flex h-full flex-col">
      <ProcessedTableClient rows={rows} title={t("title")} />
    </div>
  );
}
