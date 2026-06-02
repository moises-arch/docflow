import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { decrypt } from "../_shared/crypto.ts";
import { secrets } from "../_shared/secrets.ts";
import { odooAuthenticate, odooExecute, toOdooConnection } from "../_shared/odoo.ts";

interface Payload {
  tenant_id?: string;
  run_id?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 500;
// Safety net to prevent infinite loops if Odoo misbehaves; large enough that no real
// catalog will hit it. Each batch is logged so we know if we're approaching it.
const SAFETY_MAX_ITERATIONS = 200; // 200 * 500 = 100,000 rows per category

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

async function syncRefCatalog(params: {
  tenantId: string;
  supabase: ReturnType<typeof createServiceClient>;
  conn: ReturnType<typeof toOdooConnection>;
  uid: number;
  model: string;
  catalogType: string;
  fields: string[];
  order?: string;
  normalize: (item: Record<string, unknown>) => {
    external_id: string;
    code?: string | null;
    name: string;
    active?: boolean;
    raw: Record<string, unknown>;
  };
}) {
  const { tenantId, supabase, conn, uid, model, catalogType, fields, order, normalize } = params;
  let offset = 0;
  let imported = 0;
  let iterations = 0;
  const now = new Date().toISOString();

  while (iterations < SAFETY_MAX_ITERATIONS) {
    iterations++;
    const rows = (await odooExecute(conn, uid, model, "search_read", [[]], {
      fields,
      offset,
      limit: PAGE_SIZE,
      order: order ?? "name asc",
      context: { active_test: false },
    })) as Array<Record<string, unknown>>;

    if (!Array.isArray(rows) || rows.length === 0) break;

    const payload = rows.map((item) => {
      const data = normalize(item);
      return {
        tenant_id: tenantId,
        provider: "odoo",
        catalog_type: catalogType,
        external_id: data.external_id,
        code: data.code ?? null,
        name: data.name,
        active: data.active ?? true,
        raw: data.raw,
        last_synced_at: now,
      };
    });

    const { error } = await supabase
      .from("integration_catalog_refs")
      .upsert(payload, { onConflict: "tenant_id,provider,catalog_type,external_id" });
    if (error) throw new Error(`Catalog refs upsert failed (${catalogType}): ${error.message}`);

    imported += payload.length;
    offset += rows.length;
    if (rows.length < PAGE_SIZE) break; // last page
  }

  console.log(`[odoo-sync-catalog] ${catalogType}: ${imported} synced in ${iterations} batches`);
  return imported;
}

async function syncRefCatalogSafe(params: Parameters<typeof syncRefCatalog>[0]) {
  try {
    const imported = await syncRefCatalog(params);
    return { imported, error: null as string | null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { imported: 0, error: detail };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!validUuid(payload.tenant_id)) {
    return json({ error: "Invalid tenant_id" }, 400);
  }

  const tenantId = payload.tenant_id;
  const runId = payload.run_id ?? null;
  const supabase = createServiceClient();

  const { data: connection } = await supabase
    .from("odoo_connections")
    .select("base_url, database, username, api_key_enc, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!connection || connection.status !== "active") {
    return json({ error: "No active Odoo connection configured" }, 422);
  }

  try {
    const password = await decrypt(connection.api_key_enc, secrets.intakeSecretsKey);
    const conn = toOdooConnection({
      base_url: connection.base_url,
      database: connection.database,
      username: connection.username,
      password,
    });
    const uid = await odooAuthenticate(conn);

    let productOffset = 0;
    let partnerOffset = 0;
    let importedProducts = 0;
    let importedPartners = 0;
    let productIterations = 0;
    let partnerIterations = 0;
    const now = new Date().toISOString();
    const seenProductExternalIds = new Set<string>();
    const seenPartnerExternalIds = new Set<string>();

    // ── Products ──────────────────────────────────────────────────────────
    // No `active=true` filter — sync ALL products (active and archived) so the
    // UI can decide what to show. Use `active_test: false` to also include
    // archived items (Odoo otherwise excludes them by default).
    while (productIterations < SAFETY_MAX_ITERATIONS) {
      productIterations++;
      const products = (await odooExecute(
        conn,
        uid,
        "product.product",
        "search_read",
        [[["active", "=", true]]],
        {
          fields: ["id", "name", "default_code", "barcode", "uom_id", "active", "image_128"],
          offset: productOffset,
          limit: PAGE_SIZE,
          order: "id asc",
        },
      )) as Array<{
        id: number;
        name?: string;
        default_code?: string | false;
        barcode?: string | false;
        uom_id?: [number, string] | false;
        active?: boolean;
      }>;

      if (!Array.isArray(products) || products.length === 0) break;

      const rows = products.map((item) => {
        const externalId = String(item.id);
        seenProductExternalIds.add(externalId);
        return {
          tenant_id: tenantId,
          provider: "odoo",
          external_id: externalId,
          code: typeof item.default_code === "string" ? item.default_code : null,
          barcode: typeof item.barcode === "string" ? item.barcode : null,
          name: item.name ?? `Product ${item.id}`,
          uom: Array.isArray(item.uom_id) ? item.uom_id[1] : null,
          active: item.active ?? true,
          raw: item,
          last_synced_at: now,
        };
      });

      const { error } = await supabase
        .from("integration_catalog_products")
        .upsert(rows, { onConflict: "tenant_id,provider,external_id" });
      if (error) throw new Error(`Catalog products upsert failed: ${error.message}`);

      importedProducts += rows.length;
      productOffset += products.length;
      if (products.length < PAGE_SIZE) break; // last page
    }
    console.log(
      `[odoo-sync-catalog] products: ${importedProducts} synced in ${productIterations} batches`,
    );

    // ── Partners ──────────────────────────────────────────────────────────
    while (partnerIterations < SAFETY_MAX_ITERATIONS) {
      partnerIterations++;
      // Only top-level: companies OR individuals without a parent company.
      // Excludes sub-contacts and address variants (billing, delivery) that
      // share the parent name and produce apparent duplicates.
      const partners = (await odooExecute(conn, uid, "res.partner", "search_read", [[
        "|",
        ["is_company", "=", true],
        ["parent_id", "=", false],
      ]], {
        fields: [
          "id",
          "name",
          "vat",
          "email",
          "phone",
          "city",
          "country_id",
          "active",
          "is_company",
          "parent_id",
          "company_type",
          "ref",
        ],
        offset: partnerOffset,
        limit: PAGE_SIZE,
        order: "id asc",
        context: { active_test: false },
      })) as Array<{
        id: number;
        name?: string;
        vat?: string | false;
        email?: string | false;
        phone?: string | false;
        city?: string | false;
        country_id?: [number, string] | false;
        active?: boolean;
        is_company?: boolean;
        parent_id?: [number, string] | false;
        company_type?: string | false;
      }>;

      if (!Array.isArray(partners) || partners.length === 0) break;

      const rows = partners.map((item) => {
        const externalId = String(item.id);
        seenPartnerExternalIds.add(externalId);
        return {
          tenant_id: tenantId,
          provider: "odoo",
          external_id: externalId,
          name: item.name ?? `Partner ${item.id}`,
          vat: typeof item.vat === "string" ? item.vat : null,
          email: typeof item.email === "string" ? item.email : null,
          phone: typeof item.phone === "string" ? item.phone : null,
          city: typeof item.city === "string" ? item.city : null,
          country: Array.isArray(item.country_id) ? item.country_id[1] : null,
          active: item.active ?? true,
          raw: item,
          last_synced_at: now,
        };
      });

      const { error } = await supabase
        .from("integration_catalog_partners")
        .upsert(rows, { onConflict: "tenant_id,provider,external_id" });
      if (error) throw new Error(`Catalog partners upsert failed: ${error.message}`);

      importedPartners += rows.length;
      partnerOffset += partners.length;
      if (partners.length < PAGE_SIZE) break;
    }
    console.log(
      `[odoo-sync-catalog] partners: ${importedPartners} synced in ${partnerIterations} batches`,
    );

    // ── Cleanup: mark as inactive any rows that weren't seen this run ────
    // Only runs if at least one row was synced (avoids wiping data on partial fail)
    if (importedProducts > 0 && seenProductExternalIds.size > 0) {
      const seen = Array.from(seenProductExternalIds);
      const { error } = await supabase
        .from("integration_catalog_products")
        .update({ active: false, last_synced_at: now })
        .eq("tenant_id", tenantId)
        .eq("provider", "odoo")
        .not("external_id", "in", `(${seen.map((id) => `"${id}"`).join(",")})`);
      if (error) console.error("[odoo-sync-catalog] product deactivate failed", error.message);
    }
    if (importedPartners > 0 && seenPartnerExternalIds.size > 0) {
      const seen = Array.from(seenPartnerExternalIds);
      const { error } = await supabase
        .from("integration_catalog_partners")
        .update({ active: false, last_synced_at: now })
        .eq("tenant_id", tenantId)
        .eq("provider", "odoo")
        .not("external_id", "in", `(${seen.map((id) => `"${id}"`).join(",")})`);
      if (error) console.error("[odoo-sync-catalog] partner deactivate failed", error.message);
    }

    const importedCurrencies = await syncRefCatalogSafe({
      tenantId,
      supabase,
      conn,
      uid,
      model: "res.currency",
      catalogType: "currencies",
      fields: ["id", "name", "symbol", "active"],
      normalize: (item) => ({
        external_id: String(item.id ?? ""),
        code: typeof item.name === "string" ? item.name : null,
        name: typeof item.name === "string" ? item.name : `Currency ${item.id ?? ""}`,
        active: typeof item.active === "boolean" ? item.active : true,
        raw: item,
      }),
    });

    const importedTaxes = await syncRefCatalogSafe({
      tenantId,
      supabase,
      conn,
      uid,
      model: "account.tax",
      catalogType: "taxes",
      fields: ["id", "name", "amount", "type_tax_use", "active"],
      normalize: (item) => ({
        external_id: String(item.id ?? ""),
        code: typeof item.type_tax_use === "string" ? item.type_tax_use : null,
        name: typeof item.name === "string" ? item.name : `Tax ${item.id ?? ""}`,
        active: typeof item.active === "boolean" ? item.active : true,
        raw: item,
      }),
    });

    const importedUoms = await syncRefCatalogSafe({
      tenantId,
      supabase,
      conn,
      uid,
      model: "uom.uom",
      catalogType: "uoms",
      fields: ["id", "name", "active"],
      normalize: (item) => ({
        external_id: String(item.id ?? ""),
        code: null,
        name: typeof item.name === "string" ? item.name : `UoM ${item.id ?? ""}`,
        active: typeof item.active === "boolean" ? item.active : true,
        raw: item,
      }),
    });

    const importedWarehouses = await syncRefCatalogSafe({
      tenantId,
      supabase,
      conn,
      uid,
      model: "stock.warehouse",
      catalogType: "warehouses",
      fields: ["id", "name", "code", "active"],
      normalize: (item) => ({
        external_id: String(item.id ?? ""),
        code: typeof item.code === "string" ? item.code : null,
        name: typeof item.name === "string" ? item.name : `Warehouse ${item.id ?? ""}`,
        active: typeof item.active === "boolean" ? item.active : true,
        raw: item,
      }),
    });

    const importedCarriers = await syncRefCatalogSafe({
      tenantId,
      supabase,
      conn,
      uid,
      model: "delivery.carrier",
      catalogType: "carriers",
      fields: ["id", "name", "delivery_type", "active"],
      normalize: (item) => ({
        external_id: String(item.id ?? ""),
        code: typeof item.delivery_type === "string" ? item.delivery_type : null,
        name: typeof item.name === "string" ? item.name : `Carrier ${item.id ?? ""}`,
        active: typeof item.active === "boolean" ? item.active : true,
        raw: item,
      }),
    });

    const importedPaymentTerms = await syncRefCatalogSafe({
      tenantId,
      supabase,
      conn,
      uid,
      model: "account.payment.term",
      catalogType: "payment_terms",
      fields: ["id", "name", "active"],
      normalize: (item) => ({
        external_id: String(item.id ?? ""),
        code: null,
        name: typeof item.name === "string" ? item.name : `Payment term ${item.id ?? ""}`,
        active: typeof item.active === "boolean" ? item.active : true,
        raw: item,
      }),
    });

    const importedSalesTeams = await syncRefCatalogSafe({
      tenantId,
      supabase,
      conn,
      uid,
      model: "crm.team",
      catalogType: "sales_teams",
      fields: ["id", "name", "active"],
      normalize: (item) => ({
        external_id: String(item.id ?? ""),
        code: null,
        name: typeof item.name === "string" ? item.name : `Sales team ${item.id ?? ""}`,
        active: typeof item.active === "boolean" ? item.active : true,
        raw: item,
      }),
    });

    const totalImported =
      importedProducts +
      importedPartners +
      importedCurrencies.imported +
      importedTaxes.imported +
      importedUoms.imported +
      importedWarehouses.imported +
      importedCarriers.imported +
      importedPaymentTerms.imported +
      importedSalesTeams.imported;

    if (runId) {
      await supabase
        .from("odoo_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: true,
          imported: totalImported,
          deactivated: null,
        })
        .eq("id", runId);
    }

    return json({
      ok: true,
      products: importedProducts,
      partners: importedPartners,
      refs: {
        currencies: importedCurrencies.imported,
        taxes: importedTaxes.imported,
        uoms: importedUoms.imported,
        warehouses: importedWarehouses.imported,
        carriers: importedCarriers.imported,
        payment_terms: importedPaymentTerms.imported,
        sales_teams: importedSalesTeams.imported,
      },
      warnings: [
        importedCurrencies.error
          ? { catalog: "currencies", error: importedCurrencies.error }
          : null,
        importedTaxes.error ? { catalog: "taxes", error: importedTaxes.error } : null,
        importedUoms.error ? { catalog: "uoms", error: importedUoms.error } : null,
        importedWarehouses.error
          ? { catalog: "warehouses", error: importedWarehouses.error }
          : null,
        importedCarriers.error ? { catalog: "carriers", error: importedCarriers.error } : null,
        importedPaymentTerms.error
          ? { catalog: "payment_terms", error: importedPaymentTerms.error }
          : null,
        importedSalesTeams.error
          ? { catalog: "sales_teams", error: importedSalesTeams.error }
          : null,
      ].filter(Boolean),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (runId) {
      await supabase
        .from("odoo_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: false,
          error: message.slice(0, 500),
        })
        .eq("id", runId);
    }

    return json({ error: "Catalog sync failed", detail: message }, 500);
  }
});
