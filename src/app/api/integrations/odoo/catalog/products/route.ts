/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getIntegrationContext } from "@/app/api/integrations/_lib";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(req: Request) {
  const context = await getIntegrationContext({ ownerOnly: false });
  if ("error" in context) return context.error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = context.supabase as unknown as {
    from: (table: string) => any;
  };

  // Include raw to extract image_128 thumbnail
  let query = supabase
    .from("integration_catalog_products")
    .select("external_id, code, barcode, name, uom, last_synced_at, raw", {
      count: "exact",
    })
    .eq("tenant_id", context.tenantId)
    .eq("provider", "odoo")
    .eq("active", true);

  if (q) {
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,barcode.ilike.%${q}%`);
  }

  const { data, error, count } = await query
    .order("name", { ascending: true })
    .range(from, to);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch products", detail: error.message },
      { status: 500 },
    );
  }

  // Extract image_128 from raw — don't send full raw to client
  const items = (data ?? []).map((row: any) => ({
    external_id: row.external_id,
    code: row.code,
    barcode: row.barcode,
    name: row.name,
    uom: row.uom,
    last_synced_at: row.last_synced_at,
    image_128: typeof row.raw?.image_128 === "string" ? row.raw.image_128 : null,
  }));

  return NextResponse.json({ items, total: count ?? 0, page, pageSize });
}
