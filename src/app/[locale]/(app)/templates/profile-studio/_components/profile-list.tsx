"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormEvent } from "react";
import { DOC_KIND_OPTIONS } from "../_lib/types";
import type { ReviewProfile } from "../_lib/types";

type Props = {
  profiles: ReviewProfile[];
  selectedProfileId: string;
  profileCountById: Map<string, number>;
  busyCreate: boolean;
  onCreateProfile: (event: FormEvent<HTMLFormElement>) => void;
  onSelectProfile: (profileId: string) => void;
};

export function ProfileList({
  profiles,
  selectedProfileId,
  profileCountById,
  busyCreate,
  onCreateProfile,
  onSelectProfile,
}: Props) {
  const t = useTranslations("templates.profileStudio");

  return (
    <aside className="grid gap-3">
      <section className="border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 className="text-sm font-medium text-[var(--color-fg)]">{t("createTitle")}</h3>
        <form className="mt-3 grid gap-2" onSubmit={onCreateProfile}>
          <label className="grid gap-1 text-xs text-[var(--color-fg-mute)]">
            {t("fields.name")}
            <input
              name="name"
              required
              className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-fg)] outline-none"
            />
          </label>
          <label className="grid gap-1 text-xs text-[var(--color-fg-mute)]">
            {t("fields.documentKind")}
            <select
              name="document_kind"
              required
              className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-fg)] outline-none"
            >
              {DOC_KIND_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(`kinds.${option.key}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-[var(--color-fg-mute)]">
            {t("fields.description")}
            <textarea
              name="description"
              rows={3}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-fg)] outline-none"
            />
          </label>
          <Button type="submit" size="sm" disabled={busyCreate}>
            {busyCreate ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("actions.create")}
          </Button>
        </form>
      </section>

      <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-fg-mute)]">
          {t("profilesTitle")}
        </div>
        <div className="grid p-2">
          {profiles.map((profile) => {
            const selected = profile.id === selectedProfileId;
            const fieldCount = profileCountById.get(profile.id) ?? 0;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => onSelectProfile(profile.id)}
                className={cn(
                  "grid gap-0.5 rounded-[var(--radius-sm)] px-2 py-2 text-left",
                  selected ? "bg-[var(--color-bg)]" : "hover:bg-[var(--color-bg)]",
                )}
              >
                <span className="truncate text-sm text-[var(--color-fg)]">{profile.name}</span>
                <span className="text-xs text-[var(--color-fg-mute)]">
                  {t(
                    `kinds.${DOC_KIND_OPTIONS.find((item) => item.id === profile.document_kind)?.key ?? "custom"}`,
                  )}{" "}
                  · {fieldCount} {t("labels.fields")}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
