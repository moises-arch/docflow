"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReviewProfileLayout, ReviewSectionId, TargetField } from "../_lib/types";
import { SECTION_IDS } from "../_lib/types";

type Props = {
  editLayout: ReviewProfileLayout;
  previewFieldGroups: Record<ReviewSectionId, TargetField[]>;
  draggingFieldKey: string | null;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
  onDropOnSection: (sectionId: ReviewSectionId) => void;
  onMoveField: (key: string, direction: -1 | 1) => void;
};

export function FieldDndBoard({
  editLayout,
  previewFieldGroups,
  draggingFieldKey,
  onDragStart,
  onDragEnd,
  onDropOnSection,
  onMoveField,
}: Props) {
  const t = useTranslations("templates.profileStudio");

  return (
    <section className="grid gap-2 border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
      <p className="text-xs font-medium text-[var(--color-fg)]">{t("dnd.title")}</p>
      <p className="text-xs text-[var(--color-fg-mute)]">{t("dnd.description")}</p>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {SECTION_IDS.map((sectionId) => {
          const section = editLayout.sections.find((item) => item.id === sectionId);
          const fields = previewFieldGroups[sectionId];
          const enabled = section?.enabled ?? false;
          return (
            <div
              key={`dnd-${sectionId}`}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={() => onDropOnSection(sectionId)}
              className={cn(
                "grid min-h-[140px] content-start gap-1 rounded-[var(--radius-sm)] border border-dashed p-2",
                enabled
                  ? "border-[var(--color-border-hv)] bg-[var(--color-surface)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-mute)] opacity-70",
                draggingFieldKey && "ring-1 ring-[var(--color-fg-subtle)]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-[var(--color-fg)]">
                  {section?.label || t(`reviewSections.${sectionId}`)}
                </p>
                <span className="text-[10px] text-[var(--color-fg-mute)]">{fields.length}</span>
              </div>
              <div className="grid gap-1">
                {fields.length === 0 ? (
                  <p className="text-[11px] text-[var(--color-fg-mute)]">{t("dnd.dropHint")}</p>
                ) : (
                  fields.map((field, index) => (
                    <div
                      key={`chip-${sectionId}-${field.id}`}
                      draggable
                      onDragStart={() => onDragStart(field.key)}
                      onDragEnd={onDragEnd}
                      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-left text-[11px] text-[var(--color-fg)]"
                    >
                      <GripVertical className="size-3 text-[var(--color-fg-mute)]" />
                      <span className="min-w-0 flex-1 truncate">{field.label}</span>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() => onMoveField(field.key, -1)}
                        className="h-5 w-5"
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={index === fields.length - 1}
                        onClick={() => onMoveField(field.key, 1)}
                        className="h-5 w-5"
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
