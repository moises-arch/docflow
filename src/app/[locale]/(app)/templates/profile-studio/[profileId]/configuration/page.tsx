import { getTranslations } from "next-intl/server";
import { ProfileFrame } from "../profile-frame";
import { loadProfile } from "../_data";
import { LayoutTemplate } from "lucide-react";
import { ProfileIdentityEditor } from "./identity-editor";
import { ProfileStatusToggle } from "./status-toggle";
import { DeleteProfileDialog } from "./delete-profile-dialog";
import { BillingNormalizationToggle } from "./billing-normalization-toggle";
import { AlertTriangle } from "lucide-react";

export default async function ProfileConfigurationPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const { profile, targetFields } = await loadProfile(profileId);
  const t = await getTranslations("templates.profileStudio");

  // Compute counts
  const fieldsAssigned = targetFields.filter((f) => f.review_profile_id === profile.id).length;

  // Normalize layout to count enabled sections (defaults if null)
  const sectionsEnabled = countEnabledSections(profile.layout);
  const kindKey = profile.document_kind === "purchase_order" ? "purchaseOrder" : profile.document_kind;

  return (
    <ProfileFrame profile={profile} active="configuration">
      {/* Hero */}
      <header className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex h-7 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2.5 text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
              <LayoutTemplate size={13} aria-hidden="true" />
              {t("configuration.title")}
            </div>
            <h2 className="text-2xl font-semibold text-[var(--color-fg)]">{profile.name}</h2>
            <p className="mt-1 text-xs text-[var(--color-fg-mute)]">
              {profile.description ?? t("configuration.description")}
            </p>
          </div>
          <ProfileStatusToggle
            profileId={profile.id}
            initialActive={profile.active}
            isSystem={profile.system}
          />
        </div>
      </header>

      {/* KPI strip */}
      <section className="grid gap-3 md:grid-cols-3">
        <Stat label={t("configuration.stats.fields")} value={String(fieldsAssigned)} />
        <Stat label={t("configuration.stats.sections")} value={String(sectionsEnabled)} />
        <Stat label={t("configuration.stats.kind")} value={t(`kinds.${kindKey}`)} />
      </section>

      {/* Identity editor */}
      <ProfileIdentityEditor profile={profile} />

      {/* Billing normalization */}
      <BillingNormalizationToggle profile={profile} />

      {/* Danger zone — only for non-system profiles */}
      {!profile.system && (
        <section className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-rose)]/20 bg-[color:var(--color-rose)]/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[color:var(--color-rose)]/10 text-[color:var(--color-rose)]">
                <AlertTriangle size={14} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-fg)]">
                  {t("deleteProfile.dialogTitle")}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
                  {t("deleteProfile.intro", { name: profile.name })}
                </p>
              </div>
            </div>
            <DeleteProfileDialog
              profileId={profile.id}
              profileName={profile.name}
              isSystem={profile.system}
            />
          </div>
        </section>
      )}
    </ProfileFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[11px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
        {label}
      </p>
      <p className="text-2xl leading-none font-bold text-[var(--color-fg)] tabular-nums">{value}</p>
    </div>
  );
}

function countEnabledSections(layout: Record<string, unknown> | null): number {
  if (!layout || typeof layout !== "object") return 4; // default all enabled
  const sections = (layout as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return 4;
  let count = 0;
  for (const s of sections) {
    if (s && typeof s === "object" && (s as { enabled?: unknown }).enabled !== false) count++;
  }
  return count;
}
