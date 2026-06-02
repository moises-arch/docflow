import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { requireSettingsAccess } from "../../settings/_lib";
import { getTranslations } from "next-intl/server";
import { ProvidersListClient } from "../providers-list-client";
import { type Provider, type ProviderStats } from "../types";
import { Boxes, Building2, GitBranch, Radar } from "lucide-react";

type ProviderFieldMappingRow = {
  provider_id: string;
};

type ProviderProductMappingRow = {
  provider_id: string;
};

type ProviderDocumentRow = {
  provider_id: string;
  state: string;
  created_at: string;
};

export default async function ProvidersPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const t = await getTranslations("settings.providers");
  const db = supabase as unknown as DynamicSupabaseClient;

  const { data: providers } = await db
    .from<Provider[]>("providers")
    .select("id, name, code, status, default_currency, email_domains, settings, created_at")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  const [{ data: fieldMappings }, { data: productMappings }, { data: documents }] = await Promise.all([
    db
      .from<ProviderFieldMappingRow[]>("provider_field_mappings")
      .select("provider_id")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    db
      .from<ProviderProductMappingRow[]>("provider_product_mappings")
      .select("provider_id")
      .eq("tenant_id", tenantId),
    db
      .from<ProviderDocumentRow[]>("documents")
      .select("provider_id, state, created_at")
      .eq("tenant_id", tenantId)
      .not("provider_id", "is", null)
      .not("state", "eq", "archived"),
  ]);

  const providerStats = buildProviderStats(
    fieldMappings ?? [],
    productMappings ?? [],
    documents ?? [],
  );

  return (
    <>
      <header className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-5 px-5 py-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(560px,1.5fr)] xl:items-end">
          <div>
            <div className="mb-3 inline-flex h-7 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2.5 text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
              <Radar size={13} aria-hidden="true" />
              {t("providers.console")}
            </div>
            <h1 className="text-2xl font-semibold text-[var(--color-fg)]">{t("title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--color-fg-mute)]">
              {t("description")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <HeaderMetric
              icon={Building2}
              label={t("providers.total")}
              value={(providers ?? []).length}
            />
            <HeaderMetric
              icon={Radar}
              label={t("active")}
              value={
                (providers ?? []).filter((provider) => provider.status === "active").length
              }
              tone="teal"
            />
            <HeaderMetric
              icon={GitBranch}
              label={t("providers.fieldMappings")}
              value={(fieldMappings ?? []).length}
              tone="blue"
            />
            <HeaderMetric
              icon={Boxes}
              label={t("providers.skuMappings")}
              value={(productMappings ?? []).length}
              tone="amber"
            />
          </div>
        </div>
      </header>
      <ProvidersListClient providers={providers ?? []} providerStats={providerStats} />
    </>
  );
}

function HeaderMetric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  tone?: "neutral" | "teal" | "blue" | "amber";
}) {
  const toneClass = {
    neutral:
      "text-[var(--color-fg-mute)] bg-[var(--color-surface-mute)] border-[var(--color-border)]",
    teal: "text-[color:var(--color-teal)] bg-[color:var(--color-teal)]/5 border-[color:var(--color-teal)]/20",
    blue: "text-[color:var(--color-blue)] bg-[color:var(--color-blue)]/5 border-[color:var(--color-blue)]/20",
    amber:
      "text-[color:var(--color-amber)] bg-[color:var(--color-amber)]/5 border-[color:var(--color-amber)]/20",
  }[tone];

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

function buildProviderStats(
  fieldMappings: ProviderFieldMappingRow[],
  productMappings: ProviderProductMappingRow[],
  documents: ProviderDocumentRow[],
) {
  const stats: Record<string, ProviderStats> = {};

  for (const mapping of fieldMappings) {
    const item = ensureStats(stats, mapping.provider_id);
    item.fieldMappingCount += 1;
  }

  for (const mapping of productMappings) {
    const item = ensureStats(stats, mapping.provider_id);
    item.skuMappingCount += 1;
  }

  for (const doc of documents) {
    const item = ensureStats(stats, doc.provider_id);
    item.documentsTotal += 1;
    if (doc.state === "reviewed") item.documentsReviewed += 1;
    else if (doc.state === "needs_review") item.documentsNeedsReview += 1;
    else if (doc.state === "failed_processing" || doc.state === "rejected")
      item.documentsFailed += 1;
    if (!item.lastDocumentAt || doc.created_at > item.lastDocumentAt) {
      item.lastDocumentAt = doc.created_at;
    }
  }

  return stats;
}

function ensureStats(stats: Record<string, ProviderStats>, providerId: string) {
  stats[providerId] ??= {
    fieldMappingCount: 0,
    skuMappingCount: 0,
    documentsTotal: 0,
    documentsReviewed: 0,
    documentsNeedsReview: 0,
    documentsFailed: 0,
    lastDocumentAt: null,
  };
  return stats[providerId];
}
