import { getTranslations } from "next-intl/server";
import { loadProvider } from "../_data";
import { ProviderAdminFrame } from "../provider-admin-frame";
import type { FieldMapping, TargetField } from "../../types";
import { SourceTargetClient } from "./source-target-client";
import { CheckCircle2, FileText, GitBranch, Radar } from "lucide-react";

export default async function ProviderSourceTargetPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const { db, tenantId, provider } = await loadProvider(providerId);
  const t = await getTranslations("settings.providers");

  const [{ data: targetFields }, { data: mappings }] = await Promise.all([
    db
      .from<TargetField[]>("target_fields")
      .select(
        "id, key, label, scope, target_model, target_field, value_type, required, active, system, sort_order",
      )
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("scope", { ascending: true })
      .order("sort_order", { ascending: true }),
    db
      .from<FieldMapping[]>("provider_field_mappings")
      .select("id, provider_id, target_field_id, source_field_key, source_field_label, active")
      .eq("tenant_id", tenantId)
      .eq("provider_id", provider.id)
      .eq("active", true)
      .order("source_field_key", { ascending: true }),
  ]);
  const mappedTargetIds = new Set((mappings ?? []).map((mapping) => mapping.target_field_id));

  return (
    <ProviderAdminFrame provider={provider} active="source-target">
      <header className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(280px,0.9fr)_minmax(520px,1.4fr)] xl:items-end">
          <div>
            <div className="mb-3 inline-flex h-7 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2.5 text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
              <Radar size={13} aria-hidden="true" />
              {provider.name}
            </div>
            <h2 className="text-2xl font-semibold text-[var(--color-fg)]">
              {t("admin.sourceTarget")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--color-fg-mute)]">
              {t("admin.sourceTargetDescription")}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <HeaderMetric
              icon={FileText}
              label={t("targetFields.title")}
              value={(targetFields ?? []).length}
            />
            <HeaderMetric
              icon={CheckCircle2}
              label={t("fieldMappings.short")}
              value={mappedTargetIds.size}
              tone="teal"
            />
            <HeaderMetric
              icon={GitBranch}
              label={t("sourceFields.title")}
              value={new Set((mappings ?? []).map((mapping) => mapping.source_field_key)).size}
            />
          </div>
        </div>
      </header>
      <SourceTargetClient
        providerId={provider.id}
        targetFields={targetFields ?? []}
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
  icon: typeof FileText;
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
