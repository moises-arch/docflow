import { redirect } from "next/navigation";
import { requireSettingsAccess } from "../../settings/_lib";
import {
  OdooAdminClient,
  type TabId,
  type IntegrationModel,
  type CatalogProduct,
  type CatalogPartner,
  type CatalogRef,
  type ProductMapping,
  type ExportProfile,
  type ExportRun,
} from "../../settings/odoo-admin-client";
import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";

const SECTION_IDS = new Set<TabId>(["connection", "schema", "catalog", "sku", "profiles", "runs"]);

const REF_TYPES = [
  "currencies",
  "taxes",
  "uoms",
  "warehouses",
  "carriers",
  "payment_terms",
  "sales_teams",
] as const;

export default async function IntegrationsOdooPage({
  searchParams,
}: {
  searchParams?: Promise<{ section?: string }>;
}) {
  const { supabase, tenantId, isOwner, locale } = await requireSettingsAccess();
  const resolvedSearchParams = (await searchParams) ?? {};
  const section = SECTION_IDS.has((resolvedSearchParams.section ?? "") as TabId)
    ? ((resolvedSearchParams.section as TabId) ?? "connection")
    : "connection";

  if (!isOwner) {
    redirect(`/${locale}/settings/general`);
  }

  const { data: odooConnection } = await supabase
    .from("odoo_connections")
    .select(
      "base_url, database, username, export_mode, contact_settings, status, last_checked_at, last_error",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const normalizedOdooConnection = odooConnection
    ? {
        ...odooConnection,
        export_mode: odooConnection.export_mode === "quotation" ? "quotation" : "sales_order",
        contact_settings: (odooConnection.contact_settings ?? null) as Record<
          string,
          unknown
        > | null,
      }
    : null;

  const db = supabase as unknown as DynamicSupabaseClient;

  // Helper for parallel count queries (uses head:true so no rows are transferred)
  const countQuery = (table: string, extra?: (q: ReturnType<DynamicSupabaseClient["from"]>) => ReturnType<DynamicSupabaseClient["from"]>) => {
    let q = db
      .from(table)
      // @ts-expect-error count option not in narrow type
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .eq("active", true);
    if (extra) q = extra(q);
    return q as unknown as Promise<{ count: number | null }>;
  };

  const [
    { data: models },
    { data: initialProducts },
    productsCountResult,
    { data: initialPartners },
    partnersCountResult,
    refsCountByType,
    { data: initialRefs },
    { data: productMappings },
    { data: exportProfiles },
    { data: exportRuns },
    { data: drafts },
  ] = await Promise.all([
    db
      .from<IntegrationModel[]>("integration_models")
      .select("model_name, model_label, transient, abstract, manual, last_synced_at")
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .order("model_name", { ascending: true }),
    // Initial products page (50 rows, all active or inactive)
    db
      .from<CatalogProduct[]>("integration_catalog_products")
      .select("external_id, code, name, uom, active")
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .order("name", { ascending: true })
      .limit(50),
    // Total products count
    countQuery("integration_catalog_products"),
    // Initial partners page (50 rows)
    db
      .from<CatalogPartner[]>("integration_catalog_partners")
      .select("external_id, name, vat, email, active")
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .order("name", { ascending: true })
      .limit(50),
    // Total partners count
    countQuery("integration_catalog_partners"),
    // Counts per refs type
    Promise.all(
      REF_TYPES.map((type) =>
        countQuery("integration_catalog_refs", (q) => q.eq("catalog_type", type)).then(
          (r) => [type, r.count ?? 0] as const,
        ),
      ),
    ),
    // Initial refs page
    db
      .from<CatalogRef[]>("integration_catalog_refs")
      .select("catalog_type, external_id, code, name, active")
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .order("catalog_type", { ascending: true })
      .order("name", { ascending: true })
      .limit(50),
    db
      .from<ProductMapping[]>("product_mappings")
      .select(
        "id, source_sku, source_company_sku, source_description, odoo_product_id, odoo_product_name",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(300),
    db
      .from<ExportProfile[]>("export_profiles")
      .select("id, name, flow, root_model, line_model, active")
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from<ExportRun[]>("export_runs")
      .select(
        "id, export_profile_id, order_draft_id, status, external_id, external_name, error_message, created_at",
      )
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .order("created_at", { ascending: false })
      .limit(120),
    db
      .from<Array<{ id: string; po_number: string | null; buyer: unknown }>>("order_drafts")
      .select("id, po_number, buyer")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  const refsCounts: Record<string, number> = {};
  let totalRefs = 0;
  for (const [type, count] of refsCountByType) {
    refsCounts[type] = count;
    totalRefs += count;
  }

  return (
    <OdooAdminClient
      initialSection={section}
      connection={normalizedOdooConnection}
      models={models ?? []}
      products={initialProducts ?? []}
      partners={initialPartners ?? []}
      refs={initialRefs ?? []}
      productMappings={productMappings ?? []}
      exportProfiles={exportProfiles ?? []}
      exportRuns={exportRuns ?? []}
      catalogCounts={{
        products: productsCountResult.count ?? 0,
        partners: partnersCountResult.count ?? 0,
        refs: totalRefs,
        refsByType: refsCounts,
      }}
      draftOptions={(drafts ?? []).map((draft) => ({
        id: draft.id,
        po_number: draft.po_number,
        customer_name:
          draft.buyer &&
          typeof draft.buyer === "object" &&
          "name" in (draft.buyer as Record<string, unknown>)
            ? String((draft.buyer as Record<string, unknown>).name ?? "")
            : null,
      }))}
    />
  );
}
