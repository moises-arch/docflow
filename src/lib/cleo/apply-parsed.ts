// Pre-populate / authoritatively overwrite an order_draft and its lines from
// Cleo's parsed payload. Applied after AI extraction completes so we end up
// with the cleanest of both: AI for any fields we can't parse + Cleo for the
// fields we can (line items, totals, addresses, PO#).
//
// Provider product mappings (their SKU → Odoo product) are applied here.
// Schema names match `order_drafts` and `order_draft_lines` real columns:
//   order_drafts:  po_number, po_date, buyer, total, subtotal, currency,
//                  shipping_address, billing_address
//   order_draft_lines: position, sku, description, quantity, unit, unit_price,
//                      line_total, odoo_product_id

import type { CleoParsed } from "@/lib/cleo/parse-html";
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

// Wait until ai-process is done before we touch the draft. Otherwise our
// updates race with the AI's writes and our values get overwritten. The
// terminal states are 'needs_review' (success) or 'failed_processing'.
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
  parsed: CleoParsed,
): Promise<ApplyResult> {
  const supabase = createServiceClient();

  // 1. Wait for ai-process to FINISH before we touch the draft. The doc
  // moves through states: uploaded → processing → needs_review (or
  // failed_processing). If we apply while ai-process is still running, our
  // line writes get overwritten when ai-process commits its own.
  // Wait conditions: draft exists AND doc state is terminal (needs_review
  // or failed_processing). Cap at DRAFT_MAX_WAIT_MS.
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

  // 2. Fetch product mappings for this provider (their SKU → Odoo product)
  let mappings: ProductMapping[] = [];
  if (providerId) {
    const { data } = await supabase
      .from("provider_product_mappings")
      .select("source_sku, odoo_product_id, odoo_product_name, odoo_default_code")
      .eq("provider_id", providerId);
    mappings = (data ?? []) as ProductMapping[];
  }
  const skuMap = new Map(mappings.map((m) => [m.source_sku, m]));

  // 2.5. Enrich `vendor_item_number` desde la extracción IA cuando viene null.
  //
  // Algunos partners (MSC Industrial Supply, p.ej.) NO incluyen el "Vendor's
  // Item Number" en el HTML/XML que Cleo nos entrega — solo el "Buyer's
  // Catalog Number". Pero el extractor IA (prompt v6+) sí lo identifica
  // correctamente desde el PDF adjunto.
  //
  // ai-process termina ANTES que apply-parsed (gracias al wait de arriba),
  // así que la extracción IA está disponible. La leemos y, para cada línea
  // Cleo sin vendor_item_number, intentamos linkearla con la línea IA por
  // buyer code (que la IA guarda como customer_sku o en alt_codes) y traer
  // su seller SKU.
  //
  // Esto evita que las líneas queden con "(sin mapeo)" cuando el catálogo
  // Odoo sí contiene el producto pero el parser EDI no extrajo el SKU.
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

    // Index: buyer-code → seller sku detectado por la IA.
    // Una línea IA puede contar como buyer code: (a) su customer_sku, o
    // (b) cualquier alt_code numérico (los UPC tienen ≥12 dígitos, los buyer
    // codes suelen tener menos — pero por seguridad indexamos todos los
    // alt_codes; el match exacto con buyer_item_number resuelve ambigüedad).
    const aiSellerSkuByBuyerCode = new Map<string, string>();
    // Índice inverso: seller SKU → buyer code detectado por la IA.
    // Cuando Cleo trae `vendor_item_number` (nuestro SKU) pero no
    // `buyer_item_number` (código del partner), recuperamos el código del
    // partner desde la extracción IA para que `customer_sku` se persista.
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
        // Si aún no tenemos buyer code para este seller SKU, y este alt_code
        // luce como partner code (no UPC, alfanumérico razonable), úsalo.
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
      // Enriquecer buyer_item_number desde la IA cuando Cleo lo omite pero
      // sí trae vendor_item_number. Esto preserva customer_sku al insertar.
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
        `[cleo-apply-parsed] enriched ${enriched} seller SKU(s) and ${enrichedBuyer} buyer code(s) from IA extraction`,
      );
    }
  } catch (err) {
    console.warn("[cleo-apply-parsed] could not enrich from extraction:", err);
    // fall through — usar el parsed Cleo tal cual
  }

  // 2b. Fetch Odoo products by default_code so we can resolve our own SKU
  // directly when Cleo ships the "Vendor's Item Number" field. This avoids
  // requiring per-provider mapping rows for partners whose EDI already
  // includes our internal SKU (e.g. Zoro).
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

  // 3. Provider default_reseller (Odoo customer)
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

  // 4. Build draft update. shipping_address / billing_address / buyer are
  // JSONB columns — the UI expects objects with separate {name, line1, city,
  // state, zip, country, phone} fields. Storing as a single concatenated
  // string leaves city/state/zip empty in the form.
  const draftUpdate: Record<string, unknown> = {};
  if (parsed.po_number) draftUpdate.po_number = parsed.po_number;
  if (parsed.date) draftUpdate.po_date = parsed.date;
  if (parsed.currency) draftUpdate.currency = parsed.currency;
  if (parsed.totals.grand_total != null) {
    draftUpdate.total = parsed.totals.grand_total;
    draftUpdate.subtotal = parsed.totals.grand_total;
  }
  if (resellerName) {
    // Happy path: provider has a configured reseller (e.g. Samsclub.com)
    draftUpdate.buyer = { name: resellerName };
  } else if (providerId) {
    // Provider is detected but has NO default_reseller configured.
    // Mark buyer as unresolved so the UI flags it for manual assignment
    // instead of inheriting the buying party (billing entity) as the
    // customer — that would create a wrong Odoo partner (e.g. "SAMS CLUB
    // 4727 HQ" instead of the EDI customer "Samsclub.com").
    draftUpdate.buyer = {
      unresolved: true,
      original_name: parsed.buying_party.company_name ?? "Unknown",
    };
  } else if (parsed.buying_party.company_name) {
    // No provider at all — fall back to buying party (best effort).
    draftUpdate.buyer = {
      name: parsed.buying_party.company_name,
      line1: parsed.buying_party.address1,
      city: parsed.buying_party.city,
      state: parsed.buying_party.state,
      zip: parsed.buying_party.zip,
      country: normalizeCountry(parsed.buying_party.country),
    };
  }

  // Build structured shipping_address object — country always normalized.
  const ship = parsed.ship_to;
  if (ship.name || ship.address1 || ship.city || ship.state || ship.zip) {
    draftUpdate.shipping_address = {
      name: ship.name ?? null,
      line1: ship.address1 ?? null,
      line2: null,
      city: ship.city ?? null,
      state: ship.state ?? null,
      zip: ship.zip ?? null,
      country: normalizeCountry(ship.country ?? "US"), // Walmart POs are always US unless stated
      phone: ship.phone ?? null,
    };
  }

  const buy = parsed.buying_party;
  if (buy.company_name || buy.address1 || buy.city) {
    draftUpdate.billing_address = {
      name: buy.company_name ?? null,
      line1: buy.address1 ?? null,
      line2: buy.address2 ?? null,
      city: buy.city ?? null,
      state: buy.state ?? null,
      zip: buy.zip ?? null,
      country: normalizeCountry(buy.country ?? "US"),
    };
  }

  // 5. Determine flagged fields for review (incomplete addresses, etc.)
  const flagged: string[] = [];
  // Flag unresolved buyer so review UI shows it before approval
  const buyerObj = draftUpdate.buyer as Record<string, unknown> | undefined;
  if (buyerObj?.unresolved === true) {
    flagged.push("buyer_unresolved");
  }
  const shipping = draftUpdate.shipping_address as
    | { name?: string | null; line1?: string | null; city?: string | null; state?: string | null; zip?: string | null }
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
  // Always mark draft as authoritatively populated by Cleo so ai-process
  // (if it runs after) does not overwrite buyer/addresses/lines/totals.
  draftUpdate.meta = {
    ...((parsed as unknown as { _existing_meta?: Record<string, unknown> })._existing_meta ?? {}),
    cleo_authoritative: true,
    cleo_apply: {
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

  // 5. Replace lines (Cleo HTML is authoritative). Delete first, then insert.
  await supabase.from("order_draft_lines").delete().eq("order_draft_id", draftId);

  const unmatched: string[] = [];
  let inserted = 0;
  for (const ln of parsed.lines) {
    // Resolution strategy:
    //   1. provider_product_mappings keyed by their SKU (buyer_item_number)
    //   2. odoo_products keyed by our SKU (vendor_item_number from EDI)
    //   3. unmatched — flagged for manual review
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
      resolvedDescription =
        mappedByProvider.odoo_product_name ?? `SKU ${resolvedSku}`;
    } else if (mappedByOurSku) {
      resolvedProductId = mappedByOurSku.odoo_product_id;
      resolvedSku = mappedByOurSku.default_code;
      resolvedDescription = mappedByOurSku.name ?? `SKU ${resolvedSku}`;
    } else {
      unmatched.push(ln.buyer_item_number);
      // Prefer our SKU over their SKU when both are present, even unmapped —
      // it's more useful to the operator who'll fix the mapping in Odoo.
      resolvedSku = ln.vendor_item_number ?? ln.buyer_item_number;
      resolvedDescription = `SKU ${resolvedSku} (sin mapeo)`;
    }

    // Customer SKU = the buyer's part number (what the partner recognizes).
    // Store only when distinct from our resolved internal SKU; otherwise null.
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
