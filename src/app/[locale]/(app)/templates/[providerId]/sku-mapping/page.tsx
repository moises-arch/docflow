import { getTranslations } from "next-intl/server";
import { loadProvider } from "../_data";
import { ProviderAdminFrame } from "../provider-admin-frame";
import type { OdooProduct, ProductMapping } from "../../types";
import { SkuMappingClient } from "./sku-mapping-client";
import { Boxes, CheckCircle2, PackageSearch, Radar } from "lucide-react";

export default async function ProviderSkuMappingPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const { db, tenantId, provider } = await loadProvider(providerId);
  const t = await getTranslations("settings.providers");

  const [{ data: products }, { data: mappings }] = await Promise.all([
    db
      .from<OdooProduct[]>("odoo_products")
      .select("odoo_product_id, name, default_code, barcode, uom_name")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name", { ascending: true }),
    db
      .from<ProductMapping[]>("provider_product_mappings")
      .select(
        "id, provider_id, source_sku, source_company_sku, source_description, odoo_product_id, odoo_product_name, odoo_default_code, source, confidence",
      )
      .eq("tenant_id", tenantId)
      .eq("provider_id", provider.id)
      .order("created_at", { ascending: false }),
  ]);
  const mappedProductIds = new Set((mappings ?? []).map((mapping) => mapping.odoo_product_id));

  return (
    <ProviderAdminFrame provider={provider} active="sku-mapping">
      <header className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(280px,0.9fr)_minmax(520px,1.4fr)] xl:items-end">
          <div>
            <div className="mb-3 inline-flex h-7 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2.5 text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
              <Radar size={13} aria-hidden="true" />
              {provider.name}
            </div>
            <h2 className="text-2xl font-semibold text-[var(--color-fg)]">
              {t("admin.skuMapping")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--color-fg-mute)]">
              {t("admin.skuMappingDescription")}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <HeaderMetric
              icon={PackageSearch}
              label={t("productMappings.catalogTitle")}
              value={(products ?? []).length}
            />
            <HeaderMetric
              icon={CheckCircle2}
              label={t("productMappings.mapped")}
              value={mappedProductIds.size}
              tone="teal"
            />
            <HeaderMetric
              icon={Boxes}
              label={t("productMappings.unmapped")}
              value={Math.max((products ?? []).length - mappedProductIds.size, 0)}
            />
          </div>
        </div>
      </header>
      <SkuMappingClient
        providerId={provider.id}
        products={products ?? []}
        mappings={mappings ?? []}
      />
    </ProviderAdminFrame>
  );
}

function HeaderMetric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  tone?: "neutral" | "teal";
}) {
  const toneClass =
    tone === "teal"
      ? "text-[color:var(--color-teal)] bg-[color:var(--color-teal)]/5 border-[color:var(--color-teal)]/20"
      : "text-[var(--color-fg-mute)] bg-[var(--color-surface-mute)] border-[var(--color-border)]";

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border ${toneClass}`}
        >
          <Icon size={14} aria-hidden="true" />
        </span>
        <span className="shrink-0 text-base font-semibold text-[var(--color-fg)] tabular-nums">
          {value}
        </span>
        <span className="min-w-0 text-xs font-medium text-[var(--color-fg-mute)]">{label}</span>
      </div>
    </div>
  );
}
