// Pre-populate / authoritatively overwrite an order_draft + lines from
// Rithum's parsed payload. Mirror of `lib/cleo/apply-parsed.ts` — same
// resolution strategy and same column names. Applied AFTER ai-process
// finishes so we don't race with its writes.

import type { RithumParsed } from "@/lib/rithum/parse-html";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeCountry } from "@/lib/odoo/country";

type ProductMapping = {
  source_sku: string;
  odoo_product_id: number;
  odoo_product_name: string | null;
  odoo_default_code: string | null;
};

export type ApplyResult = {
  draft_id: string | null;
  lines_inserted: number;
  unmatched_skus: string[];
  customer_applied: boolean;
  waited_ms: number;
};

const DRAFT_POLL_INTERVAL_MS = 2_000;
const DRAFT_MAX_WAIT_MS = 60_000;

async function findDraft(
  supabase: ReturnType<typeof createServiceClient>,
  documentId: string,
  tenantId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("order_drafts")
    .select("id")
    .eq("document_id", documentId)
    .eq("tenant_id", tenantId)
    .limit(1);
  const rows = (data ?? []) as Array<{ id: string }>;
  return rows[0] ?? null;
}

async function findDocState(
  supabase: ReturnType<typeof createServiceClient>,
  documentId: string,
  tenantId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("documents")
    .select("state")
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .limit(1);
  const rows = (data ?? []) as Array<{ state: string }>;
  return rows[0]?.state ?? null;
}

export async function applyParsedToDraft(
  documentId: string,
  tenantId: string,
  providerId: string | null,
  parsed: RithumParsed,
): Promise<ApplyResult> {
  const supabase = createServiceClient();

  // 1. Wait for ai-process terminal state before touching the draft.
  const start = Date.now();
  let draft: { id: string } | null = null;
  while (Date.now() - start < DRAFT_MAX_WAIT_MS) {
    const [foundDraft, docState] = await Promise.all([
      findDraft(supabase, documentId, tenantId),
      findDocState(supabase, documentId, tenantId),
    ]);
    draft = foundDraft;
    const terminalState = docState === "needs_review" || docState === "failed_processing";
    if (draft && terminalState) break;
    await new Promise((r) => setTimeout(r, DRAFT_POLL_INTERVAL_MS));
  }
  if (!draft) {
    return {
      draft_id: null,
      lines_inserted: 0,
      unmatched_skus: [],
      customer_applied: false,
      waited_ms: Date.now() - start,
    };
  }
  const draftId = draft.id;

  // 2. Provider product mappings (their SKU → Odoo product)
  let mappings: ProductMapping[] = [];
  if (providerId) {
    const { data } = await supabase
      .from("provider_product_mappings")
      .select("source_sku, odoo_product_id, odoo_product_name, odoo_default_code")
      .eq("provider_id", providerId);
    mappings = (data ?? []) as ProductMapping[];
  }
  const skuMap = new Map(mappings.map((m) => [m.source_sku, m]));

  // 2.5. Enriquece `vendor_item_number` desde la extracción IA cuando viene
  // null. Mismo patrón que cleo/apply-parsed.ts — el parser del portal
  // Rithum a veces no expone el seller SKU pero el extractor IA sí lo
  // identifica desde el PDF adjunto del PO.
  try {
    const { data: extraction } = await (supabase
      .from("extractions")
      .select("normalized")
      .eq("document_id", documentId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{
      data: {
        normalized: {
          line_items?: Array<{
            sku?: string | null;
            alt_codes?: string[];
            customer_sku?: string | null;
          }>;
        } | null;
      } | null;
    }>);
    const aiLines = extraction?.normalized?.line_items ?? [];
    const aiSellerSkuByBuyerCode = new Map<string, string>();
    // Índice inverso: seller SKU → buyer code IA, para enriquecer
    // buyer_item_number cuando el portal lo omite (preserva customer_sku).
    const aiBuyerCodeBySellerSku = new Map<string, string>();
    for (const al of aiLines) {
      const sellerSku = (al.sku ?? "").trim();
      if (!sellerSku) continue;
      const customerSku = (al.customer_sku ?? "").trim();
      if (customerSku) {
        aiSellerSkuByBuyerCode.set(customerSku, sellerSku);
        if (!aiBuyerCodeBySellerSku.has(sellerSku.toUpperCase())) {
          aiBuyerCodeBySellerSku.set(sellerSku.toUpperCase(), customerSku);
        }
      }
      for (const code of al.alt_codes ?? []) {
        const c = (code ?? "").trim();
        if (!c) continue;
        if (!aiSellerSkuByBuyerCode.has(c)) {
          aiSellerSkuByBuyerCode.set(c, sellerSku);
        }
        if (!aiBuyerCodeBySellerSku.has(sellerSku.toUpperCase())) {
          const isUpc = /^\d{12,14}$/.test(c);
          if (!isUpc && c.length >= 4 && c.length <= 32) {
            aiBuyerCodeBySellerSku.set(sellerSku.toUpperCase(), c);
          }
        }
      }
    }
    let enriched = 0;
    let enrichedBuyer = 0;
    for (const ln of parsed.lines) {
      if (!ln.vendor_item_number && ln.buyer_item_number) {
        const sellerSku = aiSellerSkuByBuyerCode.get(ln.buyer_item_number);
        if (sellerSku) {
          ln.vendor_item_number = sellerSku;
          enriched += 1;
        }
      }
      if (!ln.buyer_item_number && ln.vendor_item_number) {
        const buyerCode = aiBuyerCodeBySellerSku.get(ln.vendor_item_number.toUpperCase());
        if (buyerCode) {
          ln.buyer_item_number = buyerCode;
          enrichedBuyer += 1;
        }
      }
    }
    if (enriched > 0 || enrichedBuyer > 0) {
      console.log(
        `[rithum-apply-parsed] enriched ${enriched} seller SKU(s) and ${enrichedBuyer} buyer code(s) from IA extraction`,
      );
    }
  } catch (err) {
    console.warn("[rithum-apply-parsed] could not enrich from extraction:", err);
  }

  // 2b. Fetch Odoo products by default_code so we can resolve our own SKU
  // directly when the line includes the Vendor SKU.
  const ourSkus = parsed.lines
    .map((ln) => ln.vendor_item_number)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
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

  // 3. Provider default reseller (Odoo customer) — same convention as Cleo.
  let resellerOdooId: number | null = null;
  let resellerName: string | null = null;
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

  // 4. Build draft update.
  const draftUpdate: Record<string, unknown> = {};
  if (parsed.po_number) draftUpdate.po_number = parsed.po_number;
  if (parsed.order_date) draftUpdate.po_date = parsed.order_date;
  if (parsed.delivery_date) draftUpdate.delivery_date = parsed.delivery_date;
  if (parsed.totals.grand_total != null) {
    draftUpdate.total = parsed.totals.grand_total;
    draftUpdate.subtotal = parsed.totals.grand_total;
  }

  if (resellerName) {
    draftUpdate.buyer = { name: resellerName };
  } else if (providerId) {
    draftUpdate.buyer = {
      unresolved: true,
      original_name: parsed.partner ?? "Unknown",
    };
  } else if (parsed.partner) {
    draftUpdate.buyer = { name: parsed.partner };
  }

  const ship = parsed.ship_to;
  if (ship.name || ship.line1 || ship.city || ship.state || ship.zip) {
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
  }

  // Rithum Customer / Bill To section is sparse — only used to flag unresolved
  // buyer when we don't have a provider configured.
  if (!draftUpdate.billing_address && parsed.bill_to.name) {
    draftUpdate.billing_address = {
      name: parsed.bill_to.name,
      line1: null,
      line2: null,
      city: null,
      state: null,
      zip: null,
      country: "US",
    };
  }

  // 5. Flag fields needing review.
  const flagged: string[] = [];
  const buyerObj = draftUpdate.buyer as Record<string, unknown> | undefined;
  if (buyerObj?.unresolved === true) flagged.push("buyer_unresolved");

  const shipping = draftUpdate.shipping_address as
    | { line1?: string | null; city?: string | null; state?: string | null; zip?: string | null }
    | undefined;
  if (shipping) {
    const required = ["line1", "city", "state", "zip"] as const;
    for (const f of required) {
      if (!shipping[f] || String(shipping[f]).trim().length === 0) {
        flagged.push(`shipping_address.${f}`);
      }
    }
  } else {
    flagged.push("shipping_address");
  }

  draftUpdate.meta = {
    rithum_authoritative: true,
    rithum_apply: {
      applied_at: new Date().toISOString(),
      flagged_fields: flagged,
    },
  };

  if (Object.keys(draftUpdate).length > 0) {
    await (
      supabase.from("order_drafts") as unknown as {
        update: (v: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: unknown }>;
        };
      }
    )
      .update(draftUpdate)
      .eq("id", draftId);
  }

  // 6. Replace lines (Rithum HTML is authoritative).
  await supabase.from("order_draft_lines").delete().eq("order_draft_id", draftId);

  const unmatched: string[] = [];
  let inserted = 0;
  for (const ln of parsed.lines) {
    const mappedByProvider = skuMap.get(ln.buyer_item_number);
    const mappedByOurSku = ln.vendor_item_number
      ? odooByDefaultCode.get(ln.vendor_item_number)
      : undefined;

    let resolvedProductId: number | null = null;
    let resolvedSku: string;
    let resolvedDescription: string;

    if (mappedByProvider) {
      resolvedProductId = mappedByProvider.odoo_product_id;
      resolvedSku = mappedByProvider.odoo_default_code ?? ln.buyer_item_number;
      resolvedDescription = mappedByProvider.odoo_product_name ?? `SKU ${resolvedSku}`;
    } else if (mappedByOurSku) {
      resolvedProductId = mappedByOurSku.odoo_product_id;
      resolvedSku = mappedByOurSku.default_code;
      resolvedDescription = mappedByOurSku.name ?? `SKU ${resolvedSku}`;
    } else {
      unmatched.push(ln.buyer_item_number);
      resolvedSku = ln.vendor_item_number ?? ln.buyer_item_number;
      resolvedDescription = ln.description || `SKU ${resolvedSku} (sin mapeo)`;
    }

    // Customer SKU = buyer_item_number when distinct from resolved internal SKU.
    const customerSku =
      ln.buyer_item_number && ln.buyer_item_number !== resolvedSku
        ? ln.buyer_item_number
        : null;

    const row = {
      order_draft_id: draftId,
      tenant_id: tenantId,
      position: Number.parseInt(ln.line_number, 10) || 1,
      sku: resolvedSku,
      customer_sku: customerSku,
      description: resolvedDescription,
      quantity: ln.quantity,
      unit: ln.uom,
      unit_price: ln.unit_price,
      line_total: ln.total,
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
    waited_ms: Date.now() - start,
  };
}
