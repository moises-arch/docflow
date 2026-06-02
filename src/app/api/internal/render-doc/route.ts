export const runtime = "nodejs";
export const maxDuration = 60;

import { createServiceClient } from "@/lib/supabase/service";
import { buildPoHtml, type PoData, type PoLine } from "@/lib/documents/po-template";
import { buildPackingSlipHtml, type PackingSlipData, type PackingSlipLine } from "@/lib/documents/packing-slip-template";
import { renderHtmlToPdf } from "@/lib/documents/render-pdf";
import { getLogoDataUrl } from "@/lib/documents/logo";

type DbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
        };
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
      };
    };
  };
};

type LinesClient = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: string) => Promise<{ data: Array<Record<string, unknown>> | null }>;
    };
  };
};

// GET /api/internal/render-doc?type=po_pdf|packing_slip&draft_id=UUID&tenant_id=UUID
// Auth: Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}
export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const expected = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
  if (!authHeader || authHeader !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const draftId = searchParams.get("draft_id");
  const tenantId = searchParams.get("tenant_id");

  if (!type || !draftId || !tenantId) {
    return Response.json({ error: "Missing required params: type, draft_id, tenant_id" }, { status: 400 });
  }
  if (type !== "po_pdf" && type !== "packing_slip") {
    return Response.json({ error: "Invalid type. Must be po_pdf or packing_slip" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const db = supabase as unknown as DbClient;

  const { data: draft, error: draftErr } = await db
    .from("order_drafts")
    .select("id, po_number, po_date, currency, buyer, shipping_address, billing_address, notes, payment_terms, subtotal, tax_total, total, odoo_so_name, provider_id")
    .eq("id", draftId)
    .eq("tenant_id", tenantId)
    .single();

  if (draftErr || !draft) {
    return Response.json({ error: "Order draft not found" }, { status: 404 });
  }

  const { data: rawLines } = await (supabase as unknown as LinesClient)
    .from("order_draft_lines")
    .select("sku, description, quantity, unit_price, tax_rate")
    .eq("order_draft_id", draftId);

  let providerName: string | undefined;
  if (draft.provider_id) {
    const { data: prov } = await db
      .from("providers")
      .select("name")
      .eq("id", draft.provider_id as string)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (prov) providerName = prov.name as string;
  }

  const logoDataUrl = await getLogoDataUrl();

  let html: string;

  if (type === "po_pdf") {
    const lines: PoLine[] = (rawLines ?? []).map((l) => ({
      sku: (l.sku as string | null) ?? null,
      description: (l.description as string | null) ?? null,
      quantity: Number(l.quantity) || 0,
      unit_price: Number(l.unit_price) || 0,
      tax_rate: l.tax_rate != null ? Number(l.tax_rate) : null,
    }));

    const poData: PoData = {
      po_number: String(draft.po_number ?? ""),
      po_date: (draft.po_date as string | null) ?? null,
      currency: (draft.currency as string | null) ?? "USD",
      buyer: draft.buyer as PoData["buyer"],
      shipping_address: draft.shipping_address as PoData["shipping_address"],
      billing_address: draft.billing_address as PoData["billing_address"],
      notes: (draft.notes as string | null) ?? null,
      payment_terms: (draft.payment_terms as string | null) ?? null,
      subtotal: draft.subtotal != null ? Number(draft.subtotal) : null,
      tax_total: draft.tax_total != null ? Number(draft.tax_total) : null,
      total: draft.total != null ? Number(draft.total) : null,
      odoo_so_name: (draft.odoo_so_name as string | null) ?? null,
      providerName,
      lines,
      logoDataUrl,
    };

    html = buildPoHtml(poData);
  } else {
    const lines: PackingSlipLine[] = (rawLines ?? []).map((l) => ({
      sku: (l.sku as string | null) ?? null,
      description: (l.description as string | null) ?? null,
      quantity: Number(l.quantity) || 0,
    }));

    const packingData: PackingSlipData = {
      po_number: String(draft.po_number ?? ""),
      po_date: (draft.po_date as string | null) ?? null,
      buyer: draft.buyer as PackingSlipData["buyer"],
      shipping_address: draft.shipping_address as PackingSlipData["shipping_address"],
      notes: (draft.notes as string | null) ?? null,
      lines,
      logoDataUrl,
    };

    html = buildPackingSlipHtml(packingData);
  }

  const buffer = await renderHtmlToPdf(html);
  if (!buffer) return Response.json({ error: "PDF render failed" }, { status: 500 });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
    },
  });
}
