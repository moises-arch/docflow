import { LayoutTemplate } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSettingsAccess } from "../../../settings/_lib";
import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import type { ReviewProfile, TargetField } from "../../profile-studio/_lib/types";
import { ProfileStudioListClient } from "./profile-studio-list-client";

export default async function ProfileStudioPage() {
  const { supabase, tenantId, isOwner, locale } = await requireSettingsAccess();
  const t = await getTranslations("templates.profileStudio");

  if (!isOwner) {
    redirect(`/${locale}/settings/general`);
  }

  const db = supabase as unknown as DynamicSupabaseClient;

  const [{ data: reviewProfiles }, { data: targetFields }] = await Promise.all([
    db
      .from<ReviewProfile[]>("review_profiles")
      .select(
        "id, name, slug, document_kind, description, layout, active, system, sort_order, updated_at",
      )
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true }),
    db
      .from<TargetField[]>("target_fields")
      .select(
        "id, key, label, scope, target_model, target_field, value_type, required, active, system, sort_order, review_profile_id",
      )
      .eq("tenant_id", tenantId)
      .eq("active", true),
  ]);

  return (
    <div className="grid gap-5">
      <header className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(280px,1fr)_minmax(320px,auto)] xl:items-end">
          <div className="min-w-0">
            <div className="mb-2 inline-flex h-7 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2.5 text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
              <LayoutTemplate size={13} aria-hidden="true" />
              {t("title")}
            </div>
            <h2 className="text-2xl font-semibold text-[var(--color-fg)]">{t("list.title")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--color-fg-mute)]">
              {t("list.description")}
            </p>
          </div>
        </div>
      </header>

      <ProfileStudioListClient
        initialProfiles={(reviewProfiles ?? []) as ReviewProfile[]}
        initialTargetFields={(targetFields ?? []) as TargetField[]}
      />
    </div>
  );
}
