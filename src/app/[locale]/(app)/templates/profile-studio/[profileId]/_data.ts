import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { requireSettingsAccess } from "../../../settings/_lib";
import type { ReviewProfile, TargetField } from "../_lib/types";
import { redirect } from "next/navigation";

export async function loadProfile(profileId: string) {
  const { supabase, tenantId, user, locale, isOwner } = await requireSettingsAccess();

  if (!isOwner) {
    redirect(`/${locale}/settings/general`);
  }

  const db = supabase as unknown as DynamicSupabaseClient;

  const [{ data: profile }, { data: targetFields }] = await Promise.all([
    db
      .from<ReviewProfile>("review_profiles")
      .select(
        "id, name, slug, document_kind, description, layout, active, system, sort_order, updated_at, normalize_billing_from_odoo_partner",
      )
      .eq("id", profileId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    db
      .from<TargetField[]>("target_fields")
      .select(
        "id, key, label, scope, target_model, target_field, value_type, required, active, system, sort_order, review_profile_id",
      )
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (!profile) {
    redirect(`/${locale}/templates/profile-studio`);
  }

  return {
    db,
    tenantId,
    locale,
    profile: profile as ReviewProfile,
    targetFields: (targetFields ?? []) as TargetField[],
    userData: {
      id: user.id,
      email: user.email ?? "",
      name: (user.user_metadata?.full_name as string | undefined) ?? undefined,
    },
  };
}
