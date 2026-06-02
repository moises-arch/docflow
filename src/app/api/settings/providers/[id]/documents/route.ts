import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "../../_lib";

interface DocumentRow {
  id: string;
  doc_number: string | null;
  original_name: string;
  state: string;
  storage_path: string | null;
  created_at: string;
  updated_at: string;
}

interface DraftRow {
  id: string;
  document_id: string;
  po_number: string | null;
  buyer: { name?: string } | null;
  total: number | null;
  currency: string | null;
  sync_state: string;
  odoo_so_id: number | null;
  odoo_so_name: string | null;
}

export interface DocumentLogRow {
  documentId: string;
  docNumber: string | null;
  documentName: string;
  documentState: string;
  hasFile: boolean;
  createdAt: string;
  poNumber: string | null;
  customerName: string | null;
  total: number | null;
  currency: string | null;
  syncState: string;
  odooSoId: number | null;
  odooSoName: string | null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;

  const { id: providerId } = await params;
  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") ?? 50);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 100);
  const cursor = url.searchParams.get("cursor");

  let query = ctx.supabase
    .from<DocumentRow[]>("documents")
    .select("id, doc_number, original_name, state, storage_path, created_at, updated_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("provider_id", providerId);
  if (cursor) query = query.lt("created_at", cursor);
  query = query.order("created_at", { ascending: false }).limit(limit + 1);

  const { data: documents, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to load documents", detail: error.message },
      { status: 500 },
    );
  }

  const docs = documents ?? [];
  const hasMore = docs.length > limit;
  const sliced = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore ? sliced[sliced.length - 1]!.created_at : null;

  const docIds = sliced.map((d) => d.id);
  let drafts: DraftRow[] = [];
  if (docIds.length > 0) {
    const { data: draftRows } = await ctx.supabase
      .from<DraftRow[]>("order_drafts")
      .select(
        "id, document_id, po_number, buyer, total, currency, sync_state, odoo_so_id, odoo_so_name",
      )
      .eq("tenant_id", ctx.tenantId)
      .in("document_id", docIds);
    drafts = draftRows ?? [];
  }
  const draftsByDoc = new Map(drafts.map((d) => [d.document_id, d]));

  const items: DocumentLogRow[] = sliced.map((doc) => {
    const draft = draftsByDoc.get(doc.id);
    return {
      documentId: doc.id,
      docNumber: doc.doc_number ?? null,
      documentName: doc.original_name,
      documentState: doc.state,
      hasFile: Boolean(doc.storage_path),
      createdAt: doc.created_at,
      poNumber: draft?.po_number ?? null,
      customerName: draft?.buyer?.name ?? null,
      total: draft?.total ?? null,
      currency: draft?.currency ?? null,
      syncState: doc.state === "rejected" ? "rejected" : (draft?.sync_state ?? "none"),
      odooSoId: draft?.odoo_so_id ?? null,
      odooSoName: draft?.odoo_so_name ?? null,
    };
  });

  return NextResponse.json({ items, nextCursor });
}
