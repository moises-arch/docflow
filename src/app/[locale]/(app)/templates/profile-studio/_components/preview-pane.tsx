"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { ReviewLayoutSection, ReviewSectionId, TargetField } from "../_lib/types";

type Props = {
  previewTab: ReviewSectionId;
  orderedPreviewSections: ReviewLayoutSection[];
  previewFieldGroups: Record<ReviewSectionId, TargetField[]>;
  onTabChange: (sectionId: ReviewSectionId) => void;
};

export function PreviewPane({
  previewTab,
  orderedPreviewSections,
  previewFieldGroups,
  onTabChange,
}: Props) {
  const t = useTranslations("templates.profileStudio");

  const activeTab = orderedPreviewSections.some((s) => s.id === previewTab)
    ? previewTab
    : (orderedPreviewSections[0]?.id ?? "header");
  const activeFields = (previewFieldGroups[activeTab] ?? []).slice(0, 8);

  return (
    <section className="grid gap-2 border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
      <p className="text-xs font-medium text-[var(--color-fg)]">{t("preview.title")}</p>
      <p className="text-xs text-[var(--color-fg-mute)]">{t("preview.description")}</p>
      <div className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              { key: "total", value: "24,06" },
              { key: "currency", value: "USD" },
              { key: "lines", value: "1" },
            ] as const
          ).map(({ key, value }) => (
            <div
              key={key}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-[10px]"
            >
              <p className="text-[var(--color-fg-mute)]">{t(`preview.${key}`)}</p>
              <p className="mt-0.5 font-medium text-[var(--color-fg)]">{value}</p>
            </div>
          ))}
        </div>
        <div
          className="grid h-8 w-full gap-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]"
          style={{
            gridTemplateColumns: `repeat(${Math.max(orderedPreviewSections.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {orderedPreviewSections.map((section) => (
            <button
              key={`preview-tab-${section.id}`}
              type="button"
              onClick={() => onTabChange(section.id)}
              className={cn(
                "border-r border-[var(--color-border)] px-1 text-[10px] text-[var(--color-fg-mute)] last:border-r-0",
                previewTab === section.id && "bg-[var(--color-bg)] text-[var(--color-fg)]",
              )}
            >
              {section.label}
            </button>
          ))}
        </div>
        <div className="grid gap-1">
          {activeFields.map((field) => (
            <div
              key={`preview-field-${field.id}`}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5"
            >
              <p className="text-[11px] text-[var(--color-fg)]">{field.label}</p>
              <p className="mt-0.5 font-mono text-[10px] text-[var(--color-fg-mute)]">
                {field.target_model}.{field.target_field}
              </p>
            </div>
          ))}
          {activeFields.length === 0 && (
            <p className="text-[11px] text-[var(--color-fg-mute)]">{t("preview.emptySection")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
