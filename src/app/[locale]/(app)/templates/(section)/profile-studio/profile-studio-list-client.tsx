"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { CheckCircle2, FileText, GitBranch, Loader2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultLayout, layoutPayload } from "../../profile-studio/_lib/layout";
import { DOC_KIND_OPTIONS, type ReviewProfile, type TargetField } from "../../profile-studio/_lib/types";

type Props = {
  initialProfiles: ReviewProfile[];
  initialTargetFields: TargetField[];
};

export function ProfileStudioListClient({ initialProfiles, initialTargetFields }: Props) {
  const t = useTranslations("templates.profileStudio");
  const router = useRouter();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);

  const fieldsByProfile = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of initialTargetFields) {
      if (!f.review_profile_id) continue;
      m.set(f.review_profile_id, (m.get(f.review_profile_id) ?? 0) + 1);
    }
    return m;
  }, [initialTargetFields]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) =>
      [p.name, p.slug, p.document_kind, p.description ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [profiles, query]);

  const totalActive = profiles.filter((p) => p.active).length;
  const totalFields = initialTargetFields.length;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyCreate) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      document_kind: String(form.get("document_kind") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      layout: layoutPayload(defaultLayout(t)),
    };
    if (!payload.name || !payload.document_kind) {
      toast.error(t("errors.missingProfileData"));
      return;
    }
    setBusyCreate(true);
    try {
      const res = await fetch("/api/integrations/review-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { item?: ReviewProfile };
      if (!res.ok || !body.item) throw new Error();
      setProfiles((cur) => [...cur, body.item!].sort((a, b) => a.sort_order - b.sort_order));
      (event.target as HTMLFormElement).reset();
      setShowCreate(false);
      toast.success(t("toasts.profileCreated"));
      router.push(`/templates/profile-studio/${body.item.id}/configuration`);
    } catch {
      toast.error(t("errors.profileCreateFailed"));
    } finally {
      setBusyCreate(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* Stats + search */}
      <div className="grid gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(280px,1fr)] lg:items-center">
        <Stat icon={FileText} label={t("list.stats.total")} value={profiles.length} />
        <Stat icon={CheckCircle2} label={t("list.stats.active")} value={totalActive} tone="teal" />
        <Stat icon={GitBranch} label={t("list.stats.fields")} value={totalFields} />
        <label className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-fg-subtle)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("list.search")}
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] pr-3 pl-9 text-sm outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)]"
          />
        </label>
      </div>

      {/* Grid: cards + new template form */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((p) => (
          <ProfileCard
            key={p.id}
            profile={p}
            fieldsAssigned={fieldsByProfile.get(p.id) ?? 0}
          />
        ))}

        {/* New template card */}
        {!showCreate ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="grid min-h-[180px] place-items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-sm text-[var(--color-fg-mute)] transition-colors hover:border-[var(--color-fg)] hover:text-[var(--color-fg)]"
          >
            <span className="grid size-9 place-items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]">
              <Plus size={15} />
            </span>
            <span className="font-medium">{t("list.newProfile")}</span>
          </button>
        ) : (
          <form
            onSubmit={handleCreate}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-blue)]/25 bg-[color:var(--color-blue)]/5 p-4"
          >
            <p className="mb-3 text-xs font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
              {t("createTitle")}
            </p>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
                {t("fields.name")}
              </span>
              <input
                name="name"
                required
                className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm outline-none focus:border-[var(--color-fg)]"
              />
            </label>
            <label className="mt-2 block">
              <span className="mb-1 block text-[10px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
                {t("fields.documentKind")}
              </span>
              <select
                name="document_kind"
                required
                className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm outline-none focus:border-[var(--color-fg)]"
              >
                {DOC_KIND_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {t(`kinds.${opt.key}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 block">
              <span className="mb-1 block text-[10px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
                {t("fields.description")}
              </span>
              <textarea
                name="description"
                rows={2}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-fg)]"
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="h-8 px-3 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
              >
                {t("actions.create").includes("Create") ? "Cancel" : "Cancelar"}
              </button>
              <button
                type="submit"
                disabled={busyCreate}
                className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-4 text-xs font-semibold text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40"
              >
                {busyCreate ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                {t("actions.create")}
              </button>
            </div>
          </form>
        )}
      </div>

      {filtered.length === 0 && profiles.length > 0 && (
        <p className="py-6 text-center text-sm text-[var(--color-fg-subtle)]">
          {t("list.empty")}
        </p>
      )}
    </div>
  );
}

function ProfileCard({
  profile,
  fieldsAssigned,
}: {
  profile: ReviewProfile;
  fieldsAssigned: number;
}) {
  const t = useTranslations("templates.profileStudio");
  const tKinds = useTranslations("templates.profileStudio.kinds");
  const sectionsEnabled = countEnabledSections(profile.layout);
  const kindKey = profile.document_kind === "purchase_order" ? "purchaseOrder" : profile.document_kind;
  const initials = getInitials(profile.name);

  return (
    <Link
      href={`/templates/profile-studio/${profile.id}/configuration`}
      className="group flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-fg)]"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm font-semibold text-[var(--color-fg)]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--color-fg)]">{profile.name}</p>
          <p className="mt-0.5 text-[11px] text-[var(--color-fg-mute)]">{tKinds(kindKey)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
          <span
            className={cn(
              "size-1.5 rounded-full",
              profile.active
                ? "bg-[color:var(--color-teal)]"
                : "bg-[color:var(--color-amber)]",
            )}
          />
          {profile.active ? t("frame.active") : t("frame.paused")}
        </div>
      </div>

      {profile.description && (
        <p className="line-clamp-2 text-xs text-[var(--color-fg-mute)]">{profile.description}</p>
      )}

      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[var(--color-border)] pt-3">
        <Counter label={t("list.fieldsAssigned", { count: fieldsAssigned })} />
        <Counter label={t("list.sectionsEnabled", { count: sectionsEnabled })} />
      </div>

      {profile.system && (
        <span className="self-start rounded-[var(--radius-sm)] bg-[var(--color-surface-mute)] px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
          {t("frame.active") /* placeholder; system badge */}
          {" · "}
          System
        </span>
      )}
    </Link>
  );
}

function Counter({ label }: { label: string }) {
  return <p className="truncate text-[11px] text-[var(--color-fg-mute)]">{label}</p>;
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  tone?: "neutral" | "teal";
}) {
  const toneCls =
    tone === "teal"
      ? "text-[color:var(--color-teal)] bg-[color:var(--color-teal)]/5 border-[color:var(--color-teal)]/20"
      : "text-[var(--color-fg-mute)] bg-[var(--color-surface-mute)] border-[var(--color-border)]";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border",
            toneCls,
          )}
        >
          <Icon size={14} aria-hidden="true" />
        </span>
        <span className="shrink-0 text-base font-semibold text-[var(--color-fg)] tabular-nums">{value}</span>
        <span className="min-w-0 text-xs font-medium text-[var(--color-fg-mute)]">{label}</span>
      </div>
    </div>
  );
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "P"
  );
}

function countEnabledSections(layout: Record<string, unknown> | null): number {
  if (!layout || typeof layout !== "object") return 4;
  const sections = (layout as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return 4;
  let count = 0;
  for (const s of sections) {
    if (s && typeof s === "object" && (s as { enabled?: unknown }).enabled !== false) count++;
  }
  return count;
}
