import { requireSettingsAccess } from "../_lib";
import { AdminOverview } from "./admin-overview";
import { SettingsPage } from "../settings-page";
import { getBrowserMode } from "@/lib/browser-mode";

export default async function AdminPage() {
  const { supabase, user } = await requireSettingsAccess();

  const [{ data: aiConn }, { data: tenant }, { data: members }] = await Promise.all([
    supabase.from("ai_connections").select("provider, primary_model, status, last_checked_at, last_error").limit(1).single(),
    supabase.from("tenants").select("name, slug, locale, display_tz, auto_approve_clean").single(),
    supabase.from("tenant_members").select("user_id, role").order("created_at"),
  ]);

  return (
    <SettingsPage wide>
      <AdminOverview
        userId={user.id}
        aiConnection={aiConn ?? null}
        tenant={tenant ?? null}
        memberCount={members?.length ?? 0}
        browserMode={getBrowserMode()}
      />
    </SettingsPage>
  );
}
