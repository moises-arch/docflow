/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getIntegrationContext } from "@/app/api/integrations/_lib";

const ALLOWED_TYPES = new Set([
  "currencies",
  "taxes",
  "uoms",
  "warehouses",
  "carriers",
  "payment_terms",
  "sales_teams",
]);

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

export async function GET(req: Request) {
  const context = await getIntegrationContext({ ownerOnly: false });
  if ("error" in context) return context.error;

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
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

  let query = supabase
    .from("integration_catalog_refs")
    .select("id, catalog_type, external_id, code, name, last_synced_at", {
      count: "exact",
    })
    .eq("tenant_id", context.tenantId)
    .eq("provider", "odoo")
    .eq("active", true);

  if (type && ALLOWED_TYPES.has(type)) {
    query = query.eq("catalog_type", type);
  }

  if (q) {
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  }

  const { data, error, count } = await query
    .order("catalog_type", { ascending: true })
    .order("name", { ascending: true })
    .range(from, to);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch catalog refs", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  });
}
