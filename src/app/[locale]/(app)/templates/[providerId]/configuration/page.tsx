import { getTranslations } from "next-intl/server";
import { ProviderAdminFrame } from "../provider-admin-frame";
import { loadProvider } from "../_data";
import { AlertTriangle, Radar } from "lucide-react";
import { AliasesEditor } from "./aliases-editor";
import { EmailIngestEditor } from "./email-ingest-editor";
import { IdentityEditor } from "./identity-editor";
import { SyncAttachmentsEditor } from "./sync-attachments-editor";
import { KpiStrip } from "./kpi-strip";
import { StatusToggle } from "./status-toggle";
import { DeleteProviderDialog } from "./delete-provider-dialog";
import { BillingNormalizationEditor } from "./billing-normalization-editor";
import { LineKindProductsEditor } from "./line-kind-products-editor";

export default async function ProviderConfigurationPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const { provider, tenantId, db } = await loadProvider(providerId);
  const t = await getTranslations("settings.providers");
  const settings = provider.settings ?? {};

  // Lista de productos ERP del tenant para el selector de line_kind_products.
  // Top 500 ordenados por nombre — suficiente para una UI de configuración.
  type OdooProductRow = { odoo_product_id: number; name: string | null; default_code: string | null };
  const { data: odooProductRows } = (await db
    .from<OdooProductRow>("odoo_products")
    .select("odoo_product_id, name, default_code")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true })
    .limit(500)) as { data: OdooProductRow[] | null };
  const odooProducts = (odooProductRows ?? [])
    .filter((p) => p.name && Number.isFinite(p.odoo_product_id))
    .map((p) => ({
      id: Number(p.odoo_product_id),
      name: String(p.name),
      default_code: p.default_code ?? null,
    }));

  // Mapping kind → product_id existente (puede ser null o un objeto parcial).
  const lineKindProductsRaw = (settings as Record<string, unknown>).line_kind_products;
  const lineKindProducts: {
    discount?: number | null;
    freight?: number | null;
    surcharge?: number | null;
    adjustment?: number | null;
  } =
    lineKindProductsRaw && typeof lineKindProductsRaw === "object"
      ? {
          discount:
            typeof (lineKindProductsRaw as Record<string, unknown>).discount === "number"
              ? ((lineKindProductsRaw as Record<string, unknown>).discount as number)
              : null,
          freight:
            typeof (lineKindProductsRaw as Record<string, unknown>).freight === "number"
              ? ((lineKindProductsRaw as Record<string, unknown>).freight as number)
              : null,
          surcharge:
            typeof (lineKindProductsRaw as Record<string, unknown>).surcharge === "number"
              ? ((lineKindProductsRaw as Record<string, unknown>).surcharge as number)
              : null,
          adjustment:
            typeof (lineKindProductsRaw as Record<string, unknown>).adjustment === "number"
              ? ((lineKindProductsRaw as Record<string, unknown>).adjustment as number)
              : null,
        }
      : {};
  const aliases = Array.isArray(settings.aliases)
    ? (settings.aliases as unknown[]).map((a) => String(a)).filter(Boolean)
    : [];

  // Email ingest config (process_html_body, packing_slip_filename_patterns)
  const emailIngestRaw = settings.email_ingest as Record<string, unknown> | null | undefined;
  const emailIngestConfig = {
    process_html_body: emailIngestRaw?.process_html_body === true,
    packing_slip_filename_patterns: Array.isArray(emailIngestRaw?.packing_slip_filename_patterns)
      ? (emailIngestRaw.packing_slip_filename_patterns as unknown[]).map(String).filter(Boolean)
      : [],
  };

  return (
    <ProviderAdminFrame provider={provider} active="configuration">
      {/* Hero */}
      <header className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex h-7 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2.5 text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
              <Radar size={13} aria-hidden="true" />
              {t("admin.configuration")}
            </div>
            <h2 className="text-2xl font-semibold text-[var(--color-fg)]">{provider.name}</h2>
            <p className="mt-1 font-mono text-xs text-[var(--color-fg-mute)]">{provider.code}</p>
          </div>
          <StatusToggle providerId={provider.id} initialStatus={provider.status} />
        </div>
      </header>

      <KpiStrip providerId={provider.id} tenantId={tenantId} />

      <IdentityEditor provider={provider} />

      <AliasesEditor providerId={provider.id} initialAliases={aliases} />

      <EmailIngestEditor
        providerId={provider.id}
        initialConfig={emailIngestConfig}
      />

      <SyncAttachmentsEditor
        providerId={provider.id}
        initialSettings={settings as Record<string, unknown>}
      />

      <BillingNormalizationEditor
        providerId={provider.id}
        initialEnabled={settings.normalize_billing_from_odoo_partner === true}
        currentSettings={settings as Record<string, unknown>}
      />

      <LineKindProductsEditor
        providerId={provider.id}
        initial={lineKindProducts}
        currentSettings={settings as Record<string, unknown>}
        products={odooProducts}
      />

      {/* Danger zone */}
      <section className="rounded-[var(--radius-md)] border border-[color:var(--color-rose)]/20 bg-[color:var(--color-rose)]/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[color:var(--color-rose)]/10 text-[color:var(--color-rose)]">
              <AlertTriangle size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-fg)]">
                {t("deleteProvider.dialogTitle")}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
                {t("deleteProvider.intro", { name: provider.name })}
              </p>
            </div>
          </div>
          <DeleteProviderDialog
            providerId={provider.id}
            providerName={provider.name}
          />
        </div>
      </section>
    </ProviderAdminFrame>
  );
}
