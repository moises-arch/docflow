"use client";

import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { presetLayout } from "../_lib/layout";
import type {
  LayoutPresetId,
  ReviewLayoutSection,
  ReviewProfileLayout,
  ReviewSectionId,
} from "../_lib/types";

type Props = {
  editLayout: ReviewProfileLayout;
  onToggleSection: (sectionId: ReviewSectionId, enabled: boolean) => void;
  onSetDefaultSection: (sectionId: ReviewSectionId) => void;
  onRenameSectionLabel: (sectionId: ReviewSectionId, label: string) => void;
  onMoveSection: (sectionId: ReviewSectionId, direction: -1 | 1) => void;
  onApplyPreset: (layout: ReviewProfileLayout) => void;
};

export function LayoutEditor({
  editLayout,
  onToggleSection,
  onSetDefaultSection,
  onRenameSectionLabel,
  onMoveSection,
  onApplyPreset,
}: Props) {
  const t = useTranslations("templates.profileStudio");
  const [selectedPreset, setSelectedPreset] = useState<LayoutPresetId>("default");

  return (
    <section className="grid gap-2 border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
      <p className="text-xs font-medium text-[var(--color-fg)]">{t("layout.title")}</p>
      <p className="text-xs text-[var(--color-fg-mute)]">{t("layout.description")}</p>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <select
            value={selectedPreset}
            onChange={(event) => setSelectedPreset(event.target.value as LayoutPresetId)}
            className="h-8 min-w-[180px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-fg)] outline-none"
          >
            <option value="default">{t("presets.default")}</option>
            <option value="fast">{t("presets.fast")}</option>
            <option value="shipping_focus">{t("presets.shippingFocus")}</option>
          </select>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              onApplyPreset({
                ...presetLayout(selectedPreset, t),
                field_sections: editLayout.field_sections,
                field_order: editLayout.field_order,
              })
            }
          >
            <Sparkles className="size-4" />
            {t("actions.applyPreset")}
          </Button>
        </div>
        {editLayout.sections.map((section, index) => (
          <SectionRow
            key={section.id}
            section={section}
            index={index}
            totalSections={editLayout.sections.length}
            isDefault={editLayout.default_section === section.id}
            onToggle={(enabled) => onToggleSection(section.id, enabled)}
            onSetDefault={() => onSetDefaultSection(section.id)}
            onRenameLabel={(label) => onRenameSectionLabel(section.id, label)}
            onMove={(direction) => onMoveSection(section.id, direction)}
          />
        ))}
      </div>
    </section>
  );
}

type SectionRowProps = {
  section: ReviewLayoutSection;
  index: number;
  totalSections: number;
  isDefault: boolean;
  onToggle: (enabled: boolean) => void;
  onSetDefault: () => void;
  onRenameLabel: (label: string) => void;
  onMove: (direction: -1 | 1) => void;
};

function SectionRow({
  section,
  index,
  totalSections,
  isDefault,
  onToggle,
  onSetDefault,
  onRenameLabel,
  onMove,
}: SectionRowProps) {
  const t = useTranslations("templates.profileStudio");

  return (
    <div className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg)]">
          <input
            type="checkbox"
            checked={section.enabled}
            onChange={(event) => onToggle(event.target.checked)}
          />
          {t("layout.enabled")}
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg)]">
          <input
            type="radio"
            name="default_section"
            checked={isDefault}
            onChange={onSetDefault}
            disabled={!section.enabled}
          />
          {t("layout.default")}
        </label>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input
          value={section.label}
          onChange={(event) => onRenameLabel(event.target.value)}
          className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs text-[var(--color-fg)] outline-none"
          placeholder={t(`reviewSections.${section.id}`)}
        />
        <div className="inline-flex items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={index === totalSections - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
