import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NotificationsClient } from "./notifications-client";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return <div className="p-6 text-muted-foreground">No active tenant.</div>;
  }

  return <NotificationsClient tenantId={membership.tenant_id} />;
}
