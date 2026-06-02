import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { requireSettingsAccess } from "../../settings/_lib";
import type { Provider } from "../types";
import { redirect } from "next/navigation";

export async function loadProvider(providerId: string) {
  const { supabase, tenantId, user, locale } = await requireSettingsAccess();
  const db = supabase as unknown as DynamicSupabaseClient;
  const { data: provider } = await db
    .from<Provider>("providers")
    .select("id, name, code, status, default_currency, email_domains, settings, created_at")
    .eq("id", providerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!provider) {
    redirect(`/${locale}/templates`);
  }

  return {
    db,
    tenantId,
    provider,
    userData: {
      id: user.id,
      email: user.email ?? "",
      name: (user.user_metadata?.full_name as string | undefined) ?? undefined,
    },
  };
}
