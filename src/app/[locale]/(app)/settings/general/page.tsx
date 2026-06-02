import { Building2, Clock, Globe, Hash, Languages, Mail, Shield, User } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireSettingsAccess } from "../_lib";
import { SettingsPage } from "../settings-page";
import { AvatarUpload } from "./avatar-upload";

export default async function SettingsGeneralPage() {
  const { supabase, tenantId, role, user } = await requireSettingsAccess();
  const t = await getTranslations("settings");
  const tProfile = await getTranslations("settings.general.profile");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, slug, locale, display_tz")
    .eq("id", tenantId)
    .single();

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const fullName = user.user_metadata?.full_name as string | undefined;
  const initials = (fullName ?? user.email ?? "?")
    .split(/[\s@]/).filter(Boolean).slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase() ?? "").join("");

  return (
    <SettingsPage>
    <div className="grid gap-6">

      {/* Profile */}
      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
            <User size={15} className="text-[var(--color-fg-subtle)]" />
            {tProfile("title")}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{tProfile("description")}</p>
        </div>
        <div className="p-6">
          <AvatarUpload userId={user.id} currentUrl={avatarUrl} initials={initials} />
          <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-[var(--color-border)]">
            <Row icon={Mail} label={tProfile("email")} value={user.email ?? "—"} />
            <Row icon={User} label={tProfile("name")} value={fullName ?? "—"} />
            <Row icon={Shield} label={t("general.role")} value={t(`team.roles.${role}`)} badge={role === "owner"} />
          </div>
        </div>
      </section>

      {/* Tenant */}
      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
            <Building2 size={15} className="text-[var(--color-fg-subtle)]" />
            {t("general.title")}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{t("general.description")}</p>
        </div>
        <div className="p-6">
          <div className="grid gap-px overflow-hidden rounded-lg border border-[var(--color-border)]">
            <Row icon={Building2} label={t("general.tenantName")} value={tenant?.name ?? "—"} />
            <Row icon={Hash} label={t("general.slug")} value={tenant?.slug ?? "—"} mono />
            <Row icon={Languages} label={t("general.locale")} value={tenant?.locale ?? "—"} />
            <Row icon={Clock} label={t("general.timezone")} value={tenant?.display_tz ?? "—"} />
            <Row icon={Globe} label={tProfile("tenantId")} value={tenantId} mono truncate />
          </div>
        </div>
      </section>

    </div>
    </SettingsPage>
  );
}

function Row({
  icon: Icon, label, value, mono = false, truncate = false, badge = false,
}: {
  icon: typeof User; label: string; value: string;
  mono?: boolean; truncate?: boolean; badge?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 bg-[var(--color-bg)] px-4 py-3 text-sm">
      <Icon size={14} className="shrink-0 text-[var(--color-fg-subtle)]" />
      <span className="w-32 shrink-0 text-xs font-medium text-[var(--color-fg-mute)]">{label}</span>
      {badge ? (
        <span className="rounded-full border border-[color:var(--color-blue)]/30 bg-[color:var(--color-blue)]/10 px-2 py-0.5 text-xs font-medium text-[color:var(--color-blue)]">
          {value}
        </span>
      ) : (
        <span className={`min-w-0 flex-1 text-[var(--color-fg)] ${mono ? "font-mono text-xs" : ""} ${truncate ? "truncate" : ""}`}>
          {value}
        </span>
      )}
    </div>
  );
}
