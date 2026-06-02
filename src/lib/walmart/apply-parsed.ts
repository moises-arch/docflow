// Apply parsed Walmart order data directly to order_drafts + order_draft_lines.
//
// Differs from cleo/apply-parsed and rithum/apply-parsed in two ways:
// 1. Walmart data is 100% structured, so we DO NOT wait for ai-process.
//    We create the draft ourselves immediately.
// 2. We are the source of truth for Walmart orders — there's no other
//    pipeline that creates the draft first.
//
// SKU resolution mirrors the existing pattern:
//   1. provider_product_mappings (their_sku → odoo_product_id)
//   2. odoo_products by default_code (our SKU)
//   3. unmatched → flagged for review

import type { WalmartParsed } from "@/lib/walmart/parse-order";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeCountry } from "@/lib/odoo/country";
import { randomUUID } from "crypto";

type ProductMapping = {
  source_sku: string;
  odoo_product_id: number;
  odoo_product_name: string | null;
  odoo_default_code: string | null;
};

export type ApplyResult = {
  draft_id: string;
  lines_inserted: number;
  unmatched_skus: string[];
  customer_applied: boolean;
};

export async function applyWalmartToDraft(
  documentId: string,
  tenantId: string,
  providerId: string | null,
  parsed: WalmartParsed,
): Promise<ApplyResult> {
  const supabase = createServiceClient();

  // 1. Resolve provider mappings (their SKU → Odoo product)
  let mappings: ProductMapping[] = [];
  if (providerId) {
    const { data } = await supabase
      .from("provider_product_mappings")
      .select("source_sku, odoo_product_id, odoo_product_name, odoo_default_code")
      .eq("provider_id", providerId);
    mappings = (data ?? []) as ProductMapping[];
  }
  const skuMap = new Map(mappings.map((m) => [m.source_sku, m]));

  // 2. Walmart's `sku` is OUR default_code (we set it in the catalog), so
  //    look up directly in odoo_products as the primary path.
  const ourSkus = parsed.lines.map((l) => l.sku).filter(Boolean);
  const odooByDefaultCode = new Map<
    string,
    { odoo_product_id: number; name: string | null; default_code: string }
  >();
  if (ourSkus.length > 0) {
    const { data: odooRows } = await (
      supabase
        .from("odoo_products")
        .select("odoo_product_id, name, default_code")
        .eq("tenant_id", tenantId)
        .in("default_code", ourSkus) as unknown as Promise<{
        data:
          | Array<{ odoo_product_id: number; name: string | null; default_code: string }>
          | null;
      }>
    );
    for (const r of odooRows ?? []) {
      if (r.default_code) odooByDefaultCode.set(r.default_code, r);
    }
  }

  // 3. Provider's default reseller (Odoo customer)
  let resellerName: string | null = null;
  let resellerOdooId: number | null = null;
  if (providerId) {
    const { data } = await supabase
      .from("providers")
      .select("settings")
      .eq("id", providerId);
    const settings = ((data ?? [])[0] as { settings?: Record<string, unknown> })?.settings ?? {};
    const reseller = (settings as Record<string, unknown>).default_reseller as
      | { odoo_partner_id?: number; odoo_partner_name?: string }
      | undefined;
    if (reseller) {
      resellerOdooId = reseller.odoo_partner_id ?? null;
      resellerName = reseller.odoo_partner_name ?? null;
    }
  }

  // 4. Find or create the order_draft for this document.
  let draftId: string;
  const { data: existing } = await supabase
    .from("order_drafts")
    .select("id")
    .eq("document_id", documentId)
    .eq("tenant_id", tenantId)
    .limit(1);
  const existingRow = (existing as Array<{ id: string }> | null)?.[0];

  if (existingRow) {
    draftId = existingRow.id;
  } else {
    draftId = randomUUID();
    const insertResult = await (
      supabase.from("order_drafts") as unknown as {
        insert: (v: Record<string, unknown>) => {
          select: (cols: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message?: string } | null;
            }>;
          };
        };
      }
    )
      .insert({
        id: draftId,
        tenant_id: tenantId,
        document_id: documentId,
        provider_id: providerId,
        document_kind: "purchase_order",
        review_profile_id: await (async () => {
          const { data } = await supabase
            .from("review_profiles" as "documents")
            .select("id")
            .eq("tenant_id", tenantId)
            .ilike("name" as "id", "%purchase order%")
            .limit(1);
          return (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
        })(),
        po_number: parsed.po_number,
        po_date: parsed.order_date ? parsed.order_date.slice(0, 10) : null,
        currency: parsed.lines[0]?.currency ?? "USD",
        subtotal: parsed.totals.subtotal,
        total: parsed.totals.grand_total,
        meta: {
          walmart_authoritative: true,
          source: "walmart_api",
          customer_order_id: parsed.customer_order_id,
        },
      })
      .select("id")
      .single();
    if (insertResult.error) {
      throw new Error(`walmart_draft_insert_failed:${insertResult.error.message}`);
    }
  }

  // 5. Build draft update (idempotent — re-applying overwrites)
  const draftUpdate: Record<string, unknown> = {
    po_number: parsed.po_number,
    po_date: parsed.order_date ? parsed.order_date.slice(0, 10) : null,
    currency: parsed.lines[0]?.currency ?? "USD",
    subtotal: parsed.totals.subtotal,
    total: parsed.totals.grand_total,
  };

  if (resellerName) {
    draftUpdate.buyer = { name: resellerName };
  } else if (providerId) {
    draftUpdate.buyer = { unresolved: true, original_name: "Walmart Marketplace" };
  } else {
    draftUpdate.buyer = { name: "Walmart Marketplace" };
  }

  const ship = parsed.ship_to;
  draftUpdate.shipping_address = {
    name: ship.name,
    line1: ship.line1,
    line2: ship.line2,
    city: ship.city,
    state: ship.state,
    zip: ship.zip,
    country: normalizeCountry(ship.country ?? "US"),
    phone: ship.phone,
  };

  const flagged: string[] = [];
  if ((draftUpdate.buyer as Record<string, unknown>)?.unresolved) {
    flagged.push("buyer_unresolved");
  }
  for (const f of ["line1", "city", "state", "zip"] as const) {
    if (!ship[f] || String(ship[f]).trim().length === 0) {
      flagged.push(`shipping_address.${f}`);
    }
  }

  draftUpdate.meta = {
    walmart_authoritative: true,
    source: "walmart_api",
    customer_order_id: parsed.customer_order_id,
    walmart_apply: {
      applied_at: new Date().toISOString(),
      flagged_fields: flagged,
    },
  };

  await (
    supabase.from("order_drafts") as unknown as {
      update: (v: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: unknown }>;
      };
    }
  )
    .update(draftUpdate)
    .eq("id", draftId);

  // 6. Replace lines (Walmart is authoritative)
  await supabase.from("order_draft_lines").delete().eq("order_draft_id", draftId);

  const unmatched: string[] = [];
  let inserted = 0;
  for (const ln of parsed.lines) {
    const mappedByProvider = skuMap.get(ln.sku);
    const mappedByOurSku = odooByDefaultCode.get(ln.sku);

    let resolvedProductId: number | null = null;
    let resolvedSku: string;
    let resolvedDescription: string;

    if (mappedByOurSku) {
      // Most common path — Walmart's `sku` field is our default_code
      resolvedProductId = mappedByOurSku.odoo_product_id;
      resolvedSku = mappedByOurSku.default_code;
      resolvedDescription = mappedByOurSku.name ?? ln.product_name;
    } else if (mappedByProvider) {
      resolvedProductId = mappedByProvider.odoo_product_id;
      resolvedSku = mappedByProvider.odoo_default_code ?? ln.sku;
      resolvedDescription = mappedByProvider.odoo_product_name ?? ln.product_name;
    } else {
      unmatched.push(ln.sku);
      resolvedSku = ln.sku;
      resolvedDescription = ln.product_name || `SKU ${ln.sku} (sin mapeo)`;
    }

    // Customer SKU = Walmart's original sku (their_sku) when distinct from our resolved internal SKU.
    const customerSku = ln.sku && ln.sku !== resolvedSku ? ln.sku : null;

    const row = {
      order_draft_id: draftId,
      tenant_id: tenantId,
      position: Number.parseInt(ln.line_number, 10) || 1,
      sku: resolvedSku,
      customer_sku: customerSku,
      description: resolvedDescription,
      quantity: ln.quantity,
      unit: ln.unit_of_measurement,
      unit_price: ln.unit_price,
      line_total: ln.line_total,
      odoo_product_id: resolvedProductId,
    };
    const { error } = await supabase.from("order_draft_lines").insert(row);
    if (!error) inserted += 1;
  }

  return {
    draft_id: draftId,
    lines_inserted: inserted,
    unmatched_skus: unmatched,
    customer_applied: Boolean(resellerOdooId),
  };
}
