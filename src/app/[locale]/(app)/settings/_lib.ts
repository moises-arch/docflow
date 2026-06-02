import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export async function requireSettingsAccess() {
  const supabase = await createClient();
  const locale = await getLocale();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    redirect(`/${locale}/select-tenant`);
  }

  return {
    supabase,
    locale,
    user,
    tenantId: membership.tenant_id,
    role: membership.role,
    isOwner: membership.role === "owner",
  };
}
