import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NotificationsSettingsClient } from "./notifications-settings-client";

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("tenant_members").select("tenant_id, role").eq("user_id", user.id).single();
  if (!membership?.tenant_id) redirect("/login");

  return (
    <NotificationsSettingsClient
      tenantId={membership.tenant_id}
      isOwner={membership.role === "owner"}
    />
  );
}
