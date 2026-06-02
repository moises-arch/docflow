"use client";

import { useTranslations } from "next-intl";
import { defaultSectionForField } from "../_lib/layout";
import type { ReviewProfile, ReviewProfileLayout, ReviewSectionId, TargetField } from "../_lib/types";

type Props = {
  visibleFields: TargetField[];
  profiles: ReviewProfile[];
  selectedProfileId: string;
  editLayout: ReviewProfileLayout;
  busyFieldId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onAssignField: (fieldId: string, profileId: string | null) => void;
  onAssignSection: (key: string, sectionId: ReviewSectionId) => void;
};

export function FieldsTable({
  visibleFields,
  profiles,
  selectedProfileId,
  editLayout,
  busyFieldId,
  query,
  onQueryChange,
  onAssignField,
  onAssignSection,
}: Props) {
  const t = useTranslations("templates.profileStudio");

  return (
    <div className="grid gap-2">
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t("labels.searchPlaceholder")}
        className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-fg)] outline-none"
      />
      <div className="max-h-[460px] overflow-auto border border-[var(--color-border)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-fg-mute)]">
              <th className="px-2 py-2">{t("columns.field")}</th>
              <th className="px-2 py-2">{t("columns.scope")}</th>
              <th className="px-2 py-2">{t("columns.target")}</th>
              <th className="px-2 py-2">{t("columns.profile")}</th>
              <th className="px-2 py-2">{t("columns.section")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleFields.map((field) => (
              <tr key={field.id} className="border-b border-[var(--color-border)]">
                <td className="px-2 py-2">
                  <div className="grid gap-0.5">
                    <span className="font-mono text-[var(--color-fg)]">{field.key}</span>
                    <span className="text-[var(--color-fg-mute)]">{field.label}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-[var(--color-fg-mute)]">{field.scope}</td>
                <td className="px-2 py-2 font-mono text-[var(--color-fg-mute)]">
                  {field.target_model}.{field.target_field}
                </td>
                <td className="px-2 py-2">
                  <select
                    value={field.review_profile_id ?? ""}
                    disabled={busyFieldId === field.id}
                    onChange={(event) =>
                      onAssignField(field.id, event.target.value || null)
                    }
                    className="h-8 min-w-[210px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs text-[var(--color-fg)] outline-none"
                  >
                    <option value="">{t("labels.unassigned")}</option>
                    {profiles
                      .filter((profile) => profile.active)
                      .map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    value={editLayout.field_sections[field.key] ?? defaultSectionForField(field)}
                    disabled={field.review_profile_id !== selectedProfileId}
                    onChange={(event) =>
                      onAssignSection(field.key, event.target.value as ReviewSectionId)
                    }
                    className="h-8 min-w-[140px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs text-[var(--color-fg)] outline-none disabled:opacity-60"
                  >
                    <option value="header">{t("reviewSections.header")}</option>
                    <option value="shipping">{t("reviewSections.shipping")}</option>
                    <option value="lines">{t("reviewSections.lines")}</option>
                    <option value="notes">{t("reviewSections.notes")}</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
