"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, Mail, Search, Shield, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";

type Member = { user_id: string; role: string; created_at: string; email?: string | null; };

interface Props {
  initialMembers: Member[];
  currentUserId: string;
  currentUserEmail: string;
  teamTitle: string;
  teamDescription: string;
}

export function TeamPageClient({ initialMembers, currentUserId, currentUserEmail, teamTitle, teamDescription }: Props) {
  const t = useTranslations("settings.team");
  const tRoles = useTranslations("settings.team.roles");
  const tInvite = useTranslations("settings.team.invites");
  const locale = useLocale();
  const router = useRouter();

  const tCreate = useTranslations("settings.team.create");
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"invite" | "create">("create");

  // Invite form
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "owner">("member");
  const [submitting, setSubmitting] = useState(false);

  // Create user form
  const [cEmail, setCEmail] = useState("");
  const [cName, setCName] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cRole, setCRole] = useState<"member" | "owner">("member");
  const [showPass, setShowPass] = useState(false);
  const [creating, setCreating] = useState(false);

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  useEffect(() => {
    fetch("/api/settings/team/members")
      .then(r => r.ok ? r.json() : null)
      .then((d: { items?: Member[] } | null) => { if (d?.items) setMembers(d.items); })
      .catch(() => { /* keep server fallback */ });
  }, []);

  const filtered = members.filter(m => {
    if (!query.trim()) return true;
    const e = m.user_id === currentUserId ? (m.email ?? currentUserEmail) : (m.email ?? "");
    return e.toLowerCase().includes(query.toLowerCase()) || m.role.includes(query.toLowerCase());
  });

  async function createUser(ev: FormEvent) {
    ev.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/settings/team/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cEmail, password: cPassword, name: cName, role: cRole }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? tCreate("errorGeneric"));
        return;
      }
      setCEmail(""); setCName(""); setCPassword(""); setCRole("member");
      toast.success(tCreate("success"));
      router.refresh();
    } catch { toast.error(tCreate("errorGeneric")); }
    finally { setCreating(false); }
  }

  async function invite(ev: FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        toast.error(res.status === 404 ? tInvite("userNotFound") : tInvite("failed"));
        return;
      }
      setEmail(""); setRole("member");
      toast.success(tInvite("success"));
      router.refresh();
    } catch { toast.error(tInvite("failed")); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="grid gap-6">

      {/* Add member — tabbed: Create new / Invite existing */}
      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* Tab header */}
        <div className="flex items-center gap-0 border-b border-[var(--color-border)]">
          {(["create", "invite"] as const).map(t_ => (
            <button key={t_} type="button" onClick={() => setTab(t_)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                tab === t_
                  ? "border-b-2 border-[var(--color-fg)] text-[var(--color-fg)]"
                  : "text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
              }`}>
              <UserPlus size={14} />
              {t_ === "create" ? tCreate("title") : tInvite("title")}
            </button>
          ))}
        </div>

        {/* Create new user */}
        {tab === "create" && (
          <form onSubmit={createUser} className="p-6">
            <p className="mb-4 text-xs text-[var(--color-fg-mute)]">{tCreate("description")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Email */}
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-[var(--color-fg-mute)]">{tCreate("email")}</label>
                <div className="relative">
                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
                  <input type="email" required value={cEmail} onChange={e => setCEmail(e.target.value)}
                    placeholder="usuario@empresa.com" disabled={creating}
                    className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] pl-8 pr-3 text-sm text-[var(--color-fg)] outline-none transition-colors focus:border-[var(--color-fg)] disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Full name */}
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-[var(--color-fg-mute)]">{tCreate("name")}</label>
                <input type="text" value={cName} onChange={e => setCName(e.target.value)}
                  placeholder="Juan Pérez" disabled={creating}
                  className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-fg)] outline-none transition-colors focus:border-[var(--color-fg)] disabled:opacity-50"
                />
              </div>

              {/* Password */}
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-[var(--color-fg-mute)]">{tCreate("password")}</label>
                <div className="relative">
                  <input type={showPass ? "text" : "password"} required minLength={8}
                    value={cPassword} onChange={e => setCPassword(e.target.value)}
                    placeholder="••••••••" disabled={creating}
                    className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 pr-9 text-sm text-[var(--color-fg)] outline-none transition-colors focus:border-[var(--color-fg)] disabled:opacity-50"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-mute)]">
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[11px] text-[var(--color-fg-subtle)]">{tCreate("passwordHint")}</p>
              </div>

              {/* Role */}
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-[var(--color-fg-mute)]">{tCreate("role")}</label>
                <select value={cRole} onChange={e => setCRole(e.target.value as "member" | "owner")} disabled={creating}
                  className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-fg)] disabled:opacity-50">
                  <option value="member">{tRoles("member")}</option>
                  <option value="owner">{tRoles("owner")}</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={creating || !cEmail || !cPassword}
                className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-4 text-sm font-medium text-[var(--color-bg)] disabled:opacity-50">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                {creating ? tCreate("creating") : tCreate("submit")}
              </button>
            </div>
          </form>
        )}

        {/* Invite existing user */}
        {tab === "invite" && (
          <form onSubmit={invite} className="p-6">
            <p className="mb-4 text-xs text-[var(--color-fg-mute)]">{tInvite("description")}</p>
            <div className="grid gap-4 sm:grid-cols-[1fr_180px_auto]">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-[var(--color-fg-mute)]">{tInvite("email")}</label>
                <div className="relative">
                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="usuario@empresa.com" disabled={submitting}
                    className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] pl-8 pr-3 text-sm text-[var(--color-fg)] outline-none transition-colors focus:border-[var(--color-fg)] disabled:opacity-50"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-[var(--color-fg-mute)]">{tInvite("role")}</label>
                <select value={role} onChange={e => setRole(e.target.value as "member" | "owner")} disabled={submitting}
                  className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-fg)] disabled:opacity-50">
                  <option value="member">{tRoles("member")}</option>
                  <option value="owner">{tRoles("owner")}</option>
                </select>
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={submitting || !email}
                  className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-4 text-sm font-medium text-[var(--color-bg)] disabled:opacity-50">
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  {tInvite("submit")}
                </button>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[var(--color-fg-subtle)]">{t("registrationNote")}</p>
          </form>
        )}
      </section>

      {/* Members table */}
      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-6 py-4">
          <Users size={15} className="shrink-0 text-[var(--color-fg-subtle)]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[var(--color-fg)]">{teamTitle}</h2>
            <p className="text-xs text-[var(--color-fg-mute)]">{teamDescription}</p>
          </div>
          <span className="rounded-full bg-[var(--color-surface-mute)] px-2 py-0.5 text-xs font-medium text-[var(--color-fg-mute)]">
            {members.length}
          </span>
        </div>

        <div className="border-b border-[var(--color-border)] px-6 py-3">
          <div className="relative max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] pl-8 pr-8 text-xs text-[var(--color-fg)] outline-none focus:border-[var(--color-fg)]"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-mute)]">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <Th>{t("columns.member")}</Th>
                <Th>{t("columns.role")}</Th>
                <Th>{t("columns.joined")}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-sm text-[var(--color-fg-mute)]">
                    {query ? t("emptySearch") : t("emptyTeam")}
                  </td>
                </tr>
              ) : filtered.map(member => {
                const displayEmail = member.user_id === currentUserId
                  ? (member.email ?? currentUserEmail)
                  : (member.email ?? `uid: ${member.user_id.slice(0, 8)}`);
                const isMe = member.user_id === currentUserId;
                return (
                  <tr key={member.user_id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-mute)]">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-mute)] text-[10px] font-semibold text-[var(--color-fg-mute)]">
                          {displayEmail[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--color-fg)]">{displayEmail}</p>
                          {isMe && <p className="text-[11px] text-[var(--color-fg-subtle)]">{t("you")}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <RoleBadge role={member.role} label={tRoles(member.role as "owner" | "member")} />
                    </td>
                    <td className="px-6 py-3 text-xs text-[var(--color-fg-subtle)]">
                      {dateFormatter.format(new Date(member.created_at))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-6 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
      {children}
    </th>
  );
}

function RoleBadge({ role, label }: { role: string; label: string }) {
  return role === "owner" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-blue)]/30 bg-[color:var(--color-blue)]/10 px-2.5 py-0.5 text-xs font-medium text-[color:var(--color-blue)]">
      <Shield size={10} /> {label}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-fg-mute)]">
      {label}
    </span>
  );
}
