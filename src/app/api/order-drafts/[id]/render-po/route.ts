export const runtime = "nodejs";
export const maxDuration = 60;

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { buildPoHtml, type PoData, type PoLine } from "@/lib/documents/po-template";
import { renderHtmlToPdf } from "@/lib/documents/render-pdf";
import { getLogoDataUrl } from "@/lib/documents/logo";
import { createClient } from "@/lib/supabase/server";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  const supabase = await createClient();
  const db = supabase as unknown as DbClient;

  const { data: draft, error: draftErr } = await db
    .from("order_drafts")
    .select("id, po_number, po_date, currency, buyer, shipping_address, billing_address, notes, payment_terms, subtotal, tax_total, total, odoo_so_name, provider_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (draftErr || !draft) {
    return Response.json({ error: "Order draft not found" }, { status: 404 });
  }

  const { data: rawLines } = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => Promise<{ data: Array<Record<string, unknown>> | null }>;
      };
    };
  }).from("order_draft_lines").select("sku, description, quantity, unit_price, tax_rate").eq("order_draft_id", id);

  const lines: PoLine[] = (rawLines ?? []).map((l) => ({
    sku: (l.sku as string | null) ?? null,
    description: (l.description as string | null) ?? null,
    quantity: Number(l.quantity) || 0,
    unit_price: Number(l.unit_price) || 0,
    tax_rate: l.tax_rate != null ? Number(l.tax_rate) : null,
  }));

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

  const [logoDataUrl] = await Promise.all([getLogoDataUrl()]);

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

  const html = buildPoHtml(poData);
  const buffer = await renderHtmlToPdf(html);

  if (!buffer) return Response.json({ error: "PDF render failed" }, { status: 500 });

  const poNum = poData.po_number || id;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="PO-${poNum}.pdf"`,
    },
  });
}
