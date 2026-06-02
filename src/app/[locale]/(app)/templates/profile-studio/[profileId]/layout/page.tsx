import { getTranslations } from "next-intl/server";
import { ProfileFrame } from "../profile-frame";
import { loadProfile } from "../_data";
import { LayoutGrid } from "lucide-react";
import { ProfileLayoutClient } from "./profile-layout-client";

export default async function ProfileLayoutPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const { profile, targetFields } = await loadProfile(profileId);
  const t = await getTranslations("templates.profileStudio.layoutPage");

  return (
    <ProfileFrame profile={profile} active="layout">
      <header className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)]">
            <LayoutGrid size={14} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-fg)]">{t("title")}</h2>
            <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{t("description")}</p>
          </div>
        </div>
      </header>

      <ProfileLayoutClient profile={profile} initialTargetFields={targetFields} />
    </ProfileFrame>
  );
}
