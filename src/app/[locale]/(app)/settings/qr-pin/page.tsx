import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { QrPinSettingsClient } from "./qr-pin-client";

export const dynamic = "force-dynamic";

export default async function QrPinSettingsPage() {
  const supabase = await createClient();
  const locale = await getLocale();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/sign-in`);

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id) redirect(`/${locale}/select-tenant`);

  const service = createServiceClient();
  const { data: tenant } = await service
    .from("tenants")
    .select("scan_pin_hash, scan_pin_updated_at")
    .eq("id", membership.tenant_id)
    .maybeSingle();

  const row = tenant as { scan_pin_hash: string | null; scan_pin_updated_at: string | null } | null;

  return (
    <QrPinSettingsClient
      hasPin={Boolean(row?.scan_pin_hash)}
      updatedAt={row?.scan_pin_updated_at ?? null}
    />
  );
}
