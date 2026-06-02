"use client";

import { Button } from "@/components/ui/button";
import { Copy, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReviewProfile } from "../_lib/types";

type Props = {
  editName: string;
  editDescription: string;
  selectedProfile: ReviewProfile;
  busyProfileUpdate: boolean;
  busyCreate: boolean;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onSave: () => void;
  onClone: () => void;
  onToggleActive: (active: boolean) => void;
};

export function ProfileMetaForm({
  editName,
  editDescription,
  selectedProfile,
  busyProfileUpdate,
  busyCreate,
  onNameChange,
  onDescriptionChange,
  onSave,
  onClone,
  onToggleActive,
}: Props) {
  const t = useTranslations("templates.profileStudio");

  return (
    <div className="grid gap-2 border-b border-[var(--color-border)] pb-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="grid gap-2">
        <label className="grid gap-1 text-xs text-[var(--color-fg-mute)]">
          {t("fields.name")}
          <input
            value={editName}
            onChange={(event) => onNameChange(event.target.value)}
            className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-fg)] outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--color-fg-mute)]">
          {t("fields.description")}
          <textarea
            value={editDescription}
            rows={2}
            onChange={(event) => onDescriptionChange(event.target.value)}
            className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-fg)] outline-none"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onSave} disabled={busyProfileUpdate}>
          {busyProfileUpdate ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {t("actions.save")}
        </Button>
        <Button size="sm" variant="secondary" onClick={onClone} disabled={busyCreate}>
          {busyCreate ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Copy className="size-4" />
          )}
          {t("actions.clone")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onToggleActive(!selectedProfile.active)}
          disabled={busyProfileUpdate || selectedProfile.system}
        >
          {selectedProfile.active ? t("actions.disable") : t("actions.enable")}
        </Button>
      </div>
    </div>
  );
}
