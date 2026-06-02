"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, Globe2, Loader2, Mail, MoreVertical, Plus, Settings, Tags } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";

export type Provider = {
  id: string;
  name: string;
  code: string;
  status: string;
  default_currency: string | null;
  email_domains: string[];
  settings?: Record<string, unknown> | null;
  created_at: string;
};

export type TargetField = {
  id: string;
  key: string;
  label: string;
  scope: string;
  target_model: string;
  target_field: string;
  value_type: string;
  required: boolean;
  active: boolean;
  system: boolean;
  sort_order: number;
};

export type FieldMapping = {
  id: string;
  provider_id: string;
  target_field_id: string;
  source_field_key: string;
  source_field_label: string | null;
  active: boolean;
};

export type OdooProduct = {
  odoo_product_id: number;
  name: string;
  default_code: string | null;
  barcode: string | null;
  uom_name: string | null;
};

export type ProductMapping = {
  id: string;
  provider_id: string;
  source_sku: string | null;
  source_company_sku: string | null;
  source_description: string | null;
  odoo_product_id: number;
  odoo_product_name: string;
  odoo_default_code: string | null;
};

type Props = {
  providers: Provider[];
  targetFields: TargetField[];
  fieldMappings: FieldMapping[];
  odooProducts: OdooProduct[];
  productMappings: ProductMapping[];
};

export function ProvidersSettingsClient({
  providers,
  targetFields,
  fieldMappings,
  odooProducts,
  productMappings,
}: Props) {
  const router = useRouter();
  const t = useTranslations("settings.providers");
  const [selectedProviderId, setSelectedProviderId] = useState(providers[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ?? providers[0];
  const visibleTargetFields = targetFields.filter((field) => field.active);
  const filteredProviders = providers.filter((provider) => {
    const haystack = [provider.name, provider.code, ...(provider.email_domains ?? [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const productOptions = useMemo(
    () =>
      odooProducts.map((product) => ({
        value: String(product.odoo_product_id),
        label: [product.default_code, product.name].filter(Boolean).join(" · "),
      })),
    [odooProducts],
  );

  async function submit(
    path: string,
    payload: Record<string, unknown>,
    success: string,
    failure: string,
  ) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("request_failed");
      toast.success(success);
      router.refresh();
    } catch {
      toast.error(failure);
    } finally {
      setBusy(false);
    }
  }

  async function archiveTargetField(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/settings/providers/target-fields/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("delete_failed");
      toast.success(t("targetFields.deleted"));
      router.refresh();
    } catch {
      toast.error(t("targetFields.deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  function createProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const domains = String(form.get("email_domains") ?? "")
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean);

    void submit(
      "/api/settings/providers",
      {
        name: form.get("name"),
        code: form.get("code"),
        default_currency: form.get("default_currency"),
        email_domains: domains,
      },
      t("providers.created"),
      t("providers.createFailed"),
    );
  }

  function createTargetField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit(
      "/api/settings/providers/target-fields",
      {
        key: form.get("key"),
        label: form.get("label"),
        scope: form.get("scope"),
        target_model: form.get("target_model"),
        target_field: form.get("target_field"),
        value_type: form.get("value_type"),
        required: form.get("required") === "on",
      },
      t("targetFields.created"),
      t("targetFields.createFailed"),
    );
  }

  function createFieldMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProvider) return;
    const form = new FormData(event.currentTarget);
    void submit(
      "/api/settings/providers/field-mappings",
      {
        provider_id: selectedProvider.id,
        target_field_id: form.get("target_field_id"),
        source_field_key: form.get("source_field_key"),
        source_field_label: form.get("source_field_label"),
      },
      t("fieldMappings.created"),
      t("fieldMappings.createFailed"),
    );
  }

  function createProductMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProvider) return;
    const form = new FormData(event.currentTarget);
    const productId = Number(form.get("odoo_product_id"));
    const product = odooProducts.find((item) => item.odoo_product_id === productId);

    void submit(
      "/api/settings/providers/product-mappings",
      {
        provider_id: selectedProvider.id,
        source_sku: form.get("source_sku"),
        source_company_sku: form.get("source_company_sku"),
        source_description: form.get("source_description"),
        odoo_product_id: productId,
        odoo_product_name: product?.name ?? "",
        odoo_default_code: product?.default_code ?? null,
      },
      t("productMappings.created"),
      t("productMappings.createFailed"),
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-xs">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("providers.search")}
            className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)]"
          />
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {filteredProviders.map((provider) => {
          const active = provider.id === selectedProvider?.id;
          const providerFieldMappings = fieldMappings.filter(
            (mapping) => mapping.provider_id === provider.id,
          );
          const providerProductMappings = productMappings.filter(
            (mapping) => mapping.provider_id === provider.id,
          );
          return (
            <article
              key={provider.id}
              className={cn(
                "overflow-hidden rounded-[var(--radius-md)] border bg-[var(--color-surface)] transition-colors duration-[120ms]",
                active
                  ? "border-[var(--color-fg)] lg:col-span-2 2xl:col-span-3"
                  : "border-[var(--color-border)]",
              )}
            >
              <button
                type="button"
                onClick={() => setSelectedProviderId(provider.id)}
                className="block w-full p-5 text-left"
              >
                <ProviderCardHeader
                  provider={provider}
                  fieldCount={providerFieldMappings.length}
                  productCount={providerProductMappings.length}
                />
              </button>
              {active ? (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] p-5">
                  <ProviderConfiguration
                    provider={provider}
                    busy={busy}
                    visibleTargetFields={visibleTargetFields}
                    targetFields={targetFields}
                    fieldMappings={providerFieldMappings}
                    productMappings={providerProductMappings}
                    productOptions={productOptions}
                    createTargetField={createTargetField}
                    createFieldMapping={createFieldMapping}
                    createProductMapping={createProductMapping}
                    archiveTargetField={archiveTargetField}
                  />
                </div>
              ) : null}
            </article>
          );
        })}

        <article className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-hv)] bg-[var(--color-bg)] p-5">
          <div className="mb-4 grid place-items-center gap-3 py-4 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-[var(--color-surface-mute)] text-[var(--color-fg-mute)]">
              <Plus size={18} aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-fg)]">
                {t("providers.addNew")}
              </h3>
              <p className="mt-1 text-xs text-[var(--color-fg-mute)]">
                {t("providers.addNewDescription")}
              </p>
            </div>
          </div>
          <form onSubmit={createProvider} className="grid gap-3">
            <TextInput name="name" label={t("providers.name")} required />
            <TextInput name="code" label={t("providers.code")} required />
            <TextInput name="default_currency" label={t("providers.currency")} maxLength={3} />
            <TextInput
              name="email_domains"
              label={t("providers.domains")}
              placeholder="walmart.com, supplier.com"
            />
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus size={13} aria-hidden="true" />
              )}
              {t("providers.add")}
            </Button>
          </form>
        </article>
      </section>
    </div>
  );
}

function ProviderCardHeader({
  provider,
  fieldCount,
  productCount,
}: {
  provider: Provider;
  fieldCount: number;
  productCount: number;
}) {
  const t = useTranslations("settings.providers");
  const contactEmail =
    getSetting(provider, "contact_email") ?? provider.email_domains?.[0]?.replace(/^/, "orders@");
  const website = getSetting(provider, "website") ?? provider.email_domains?.[0] ?? provider.code;

  return (
    <div className="grid gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-[var(--color-surface-mute)]">
          <Globe2 size={22} className="text-[var(--color-fg-mute)]" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-[var(--radius-sm)] px-2 py-1 text-[10px] font-semibold tracking-wide uppercase",
              provider.status === "active"
                ? "bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]"
                : "bg-[var(--color-surface-mute)] text-[var(--color-fg-mute)]",
            )}
          >
            {provider.status === "active" ? t("active") : t("inactive")}
          </span>
          <MoreVertical size={16} className="text-[var(--color-fg-subtle)]" aria-hidden="true" />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-[var(--color-fg)]">{provider.name}</h3>
        <div className="mt-2 grid gap-1.5 text-sm text-[var(--color-fg-mute)]">
          <p className="flex min-w-0 items-center gap-2">
            <Mail size={14} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{contactEmail}</span>
          </p>
          <p className="flex min-w-0 items-center gap-2">
            <Globe2 size={14} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{website}</span>
          </p>
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] pt-4">
        <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-fg-subtle)]">
          <span className="flex items-center gap-1.5">
            <Clock size={13} aria-hidden="true" />
            {t("providers.lastProcessed")}
          </span>
          <span className="font-medium text-[var(--color-fg-mute)]">v1 v2 v3</span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-[color:var(--color-blue)]">
            {t("providers.viewPresets")}
          </span>
          <span className="text-[var(--color-fg-mute)]">
            {fieldCount} {t("fieldMappings.short")} · {productCount} {t("productMappings.short")}
          </span>
        </div>
      </div>
    </div>
  );
}

function ProviderConfiguration({
  provider,
  busy,
  visibleTargetFields,
  targetFields,
  fieldMappings,
  productMappings,
  productOptions,
  createTargetField,
  createFieldMapping,
  createProductMapping,
  archiveTargetField,
}: {
  provider: Provider;
  busy: boolean;
  visibleTargetFields: TargetField[];
  targetFields: TargetField[];
  fieldMappings: FieldMapping[];
  productMappings: ProductMapping[];
  productOptions: Array<{ value: string; label: string }>;
  createTargetField: (event: FormEvent<HTMLFormElement>) => void;
  createFieldMapping: (event: FormEvent<HTMLFormElement>) => void;
  createProductMapping: (event: FormEvent<HTMLFormElement>) => void;
  archiveTargetField: (id: string) => void;
}) {
  const t = useTranslations("settings.providers");

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
        <Settings size={16} aria-hidden="true" />
        {t("providerConfig.title", { provider: provider.name })}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ConfigPanel title={t("targetFields.title")} description={t("targetFields.description")}>
          <form onSubmit={createTargetField} className="grid gap-2">
            <TextInput name="key" label={t("targetFields.key")} required />
            <TextInput name="label" label={t("targetFields.label")} required />
            <Select
              name="scope"
              label={t("targetFields.scope")}
              options={["header", "line", "partner", "shipping", "billing"]}
            />
            <TextInput
              name="target_model"
              label={t("targetFields.model")}
              required
              placeholder="sale.order"
            />
            <TextInput
              name="target_field"
              label={t("targetFields.field")}
              required
              placeholder="client_order_ref"
            />
            <Select
              name="value_type"
              label={t("targetFields.type")}
              options={["text", "number", "date", "currency", "boolean", "json"]}
            />
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-fg-mute)]">
              <input type="checkbox" name="required" className="h-4 w-4" />
              {t("targetFields.required")}
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus size={13} aria-hidden="true" />
              )}
              {t("targetFields.add")}
            </Button>
          </form>
          <div className="mt-4 grid gap-2">
            {targetFields.slice(0, 8).map((field) => (
              <MiniCard key={field.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-fg)]">
                    {field.label}
                  </p>
                  <p className="truncate font-mono text-[11px] text-[var(--color-fg-subtle)]">
                    {field.target_model}.{field.target_field}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || field.system}
                  onClick={() => archiveTargetField(field.id)}
                >
                  {field.system ? t("system") : t("targetFields.remove")}
                </Button>
              </MiniCard>
            ))}
          </div>
        </ConfigPanel>

        <ConfigPanel
          title={t("fieldMappings.title")}
          description={t("fieldMappings.description", { provider: provider.name })}
        >
          <form onSubmit={createFieldMapping} className="grid gap-2">
            <Select
              name="target_field_id"
              label={t("fieldMappings.target")}
              options={visibleTargetFields.map((field) => ({
                value: field.id,
                label: `${field.label} · ${field.target_field}`,
              }))}
            />
            <TextInput
              name="source_field_key"
              label={t("fieldMappings.sourceKey")}
              required
              placeholder="item_code"
            />
            <TextInput
              name="source_field_label"
              label={t("fieldMappings.sourceLabel")}
              placeholder="Item Code"
            />
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus size={13} aria-hidden="true" />
              )}
              {t("fieldMappings.add")}
            </Button>
          </form>
          <div className="mt-4 grid gap-2">
            {fieldMappings.map((mapping) => {
              const target = targetFields.find((field) => field.id === mapping.target_field_id);
              return (
                <MiniCard key={mapping.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-fg)]">
                      {mapping.source_field_label || mapping.source_field_key}
                    </p>
                    <p className="truncate text-xs text-[var(--color-fg-subtle)]">
                      {target?.label ?? mapping.target_field_id}
                    </p>
                  </div>
                  <Tags size={14} className="text-[var(--color-fg-subtle)]" aria-hidden="true" />
                </MiniCard>
              );
            })}
          </div>
        </ConfigPanel>

        <ConfigPanel
          title={t("productMappings.title")}
          description={t("productMappings.description")}
        >
          <form onSubmit={createProductMapping} className="grid gap-2">
            <TextInput
              name="source_sku"
              label={t("productMappings.providerSku")}
              placeholder="GH500-BLK"
            />
            <TextInput
              name="source_company_sku"
              label={t("productMappings.companySku")}
              placeholder="INT-001"
            />
            <TextInput name="source_description" label={t("productMappings.descriptionField")} />
            <Select
              name="odoo_product_id"
              label={t("productMappings.odooProduct")}
              options={productOptions}
            />
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus size={13} aria-hidden="true" />
              )}
              {t("productMappings.add")}
            </Button>
          </form>
          <div className="mt-4 grid gap-2">
            {productMappings.map((mapping) => (
              <MiniCard key={mapping.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-fg)]">
                    {[mapping.source_company_sku, mapping.source_sku, mapping.source_description]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="truncate text-xs text-[var(--color-fg-subtle)]">
                    {mapping.odoo_product_name}
                  </p>
                </div>
              </MiniCard>
            ))}
          </div>
        </ConfigPanel>
      </div>
    </div>
  );
}

function ConfigPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h4 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h4>
      <p className="mt-1 text-xs text-[var(--color-fg-mute)]">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MiniCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      {children}
    </div>
  );
}

function getSetting(provider: Provider, key: string) {
  const value = provider.settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function TextInput({
  name,
  label,
  required,
  maxLength,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
        {label}
      </span>
      <input
        name={name}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)]"
      />
    </label>
  );
}

function Select({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: Array<string | { value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
        {label}
      </span>
      <select
        name={name}
        required
        className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none focus:border-[var(--color-fg)]"
      >
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
