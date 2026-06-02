export const runtime = "nodejs";
export const maxDuration = 60;

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { buildPackingSlipHtml, type PackingSlipData, type PackingSlipLine } from "@/lib/documents/packing-slip-template";
import { renderHtmlToPdf } from "@/lib/documents/render-pdf";
import { getLogoDataUrl } from "@/lib/documents/logo";
import { createClient } from "@/lib/supabase/server";

type DbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
        };
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
    .select("id, po_number, po_date, buyer, shipping_address, notes")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (draftErr || !draft) return Response.json({ error: "Order draft not found" }, { status: 404 });

  const { data: rawLines } = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => Promise<{ data: Array<Record<string, unknown>> | null }>;
      };
    };
  }).from("order_draft_lines").select("sku, description, quantity").eq("order_draft_id", id);

  const lines: PackingSlipLine[] = (rawLines ?? []).map((l) => ({
    sku: (l.sku as string | null) ?? null,
    description: (l.description as string | null) ?? null,
    quantity: Number(l.quantity) || 0,
  }));

  const logoDataUrl = await getLogoDataUrl();

  const slipData: PackingSlipData = {
    po_number: String(draft.po_number ?? ""),
    po_date: (draft.po_date as string | null) ?? null,
    buyer: draft.buyer as PackingSlipData["buyer"],
    shipping_address: draft.shipping_address as PackingSlipData["shipping_address"],
    notes: (draft.notes as string | null) ?? null,
    lines,
    logoDataUrl,
  };

  const html = buildPackingSlipHtml(slipData);
  const buffer = await renderHtmlToPdf(html);

  if (!buffer) return Response.json({ error: "PDF render failed" }, { status: 500 });

  const poNum = slipData.po_number || id;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="packing-slip-${poNum}.pdf"`,
    },
  });
}
