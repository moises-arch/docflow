import { getTranslations } from "next-intl/server";
import { requireSettingsAccess } from "../../_lib";
import { TeamPageClient } from "../../team/team-page-client";
import { SettingsPage } from "../../settings-page";

export default async function AdminTeamPage() {
  const { supabase, tenantId, user } = await requireSettingsAccess();
  const t = await getTranslations("settings");

  const { data: members } = await supabase
    .from("tenant_members")
    .select("user_id, role, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  return (
    <SettingsPage>
      <TeamPageClient
        initialMembers={members ?? []}
        currentUserId={user.id}
        currentUserEmail={user.email ?? ""}
        teamTitle={t("team.title")}
        teamDescription={t("team.description")}
      />
    </SettingsPage>
  );
}
