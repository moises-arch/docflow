// Lists recent documents for the tenant scoped by the QR scan token.
// Returns full lifecycle info per doc so the mobile app can show:
//  - upload status
//  - AI processing state
//  - Odoo SO number (when synced) or last_sync_error
// Limited to the last 50 docs of this tenant, newest first.

import { NextRequest, NextResponse } from "next/server";
import { verifyScanToken } from "@/lib/scan-token";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type DocRow = {
  id: string;
  original_name: string | null;
  state: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
  last_error: string | null;
  meta: Record<string, unknown> | null;
};

type DraftRow = {
  id: string;
  document_id: string;
  sync_state: string;
  odoo_so_id: number | null;
  odoo_so_name: string | null;
  last_sync_error: string | null;
  po_number: string | null;
  total: number | null;
  currency: string | null;
  buyer: { name?: string } | null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = verifyScanToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
  }

  const service = createServiceClient();

  // Pull last 50 documents for this tenant. The QR app is meant to surface
  // *all* inbox activity — not only QR-uploaded — per the requirements.
  const { data: docsRaw, error: docsErr } = await service
    .from("documents")
    .select(
      "id, original_name, state, mime_type, size_bytes, created_at, updated_at, last_error, meta",
    )
    .eq("tenant_id", payload.tenant_id)
    .not("state", "in", "(archived,rejected)")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<DocRow[]>();

  if (docsErr) {
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 });
  }

  const docs = docsRaw ?? [];
  const documentIds = docs.map((d) => d.id);

  let draftsByDoc = new Map<string, DraftRow>();
  if (documentIds.length > 0) {
    const { data: draftsRaw } = await service
      .from("order_drafts")
      .select(
        "id, document_id, sync_state, odoo_so_id, odoo_so_name, last_sync_error, po_number, total, currency, buyer",
      )
      .eq("tenant_id", payload.tenant_id)
      .in("document_id", documentIds)
      .returns<DraftRow[]>();
    draftsByDoc = new Map((draftsRaw ?? []).map((d) => [d.document_id, d]));
  }

  const items = docs.map((doc) => {
    const draft = draftsByDoc.get(doc.id) ?? null;
    const meta = doc.meta ?? {};
    const isQr =
      (meta as Record<string, unknown>).source === "qr-scanner";

    return {
      document_id: doc.id,
      draft_id: draft?.id ?? null,
      original_name: doc.original_name,
      mime_type: doc.mime_type,
      size_bytes: doc.size_bytes,
      state: doc.state, // uploaded | processing | needs_review | reviewed | failed_processing
      sync_state: draft?.sync_state ?? "none",
      odoo_so_id: draft?.odoo_so_id ?? null,
      odoo_so_name: draft?.odoo_so_name ?? null,
      po_number: draft?.po_number ?? null,
      total: draft?.total ?? null,
      currency: draft?.currency ?? null,
      customer_name: draft?.buyer?.name ?? null,
      last_error: doc.last_error,
      last_sync_error: draft?.last_sync_error ?? null,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      is_qr: isQr,
    };
  });

  return NextResponse.json({ items });
}
