"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TeamInviteForm } from "./team-invite-form";

type TeamMemberItem = {
  user_id: string;
  role: string;
  created_at: string;
  email?: string | null;
};

interface TeamMembersSectionProps {
  initialMembers: TeamMemberItem[];
  currentUserId: string;
  currentUserEmail: string;
  canInvite?: boolean;
}

export function TeamMembersSection({
  initialMembers,
  currentUserId,
  currentUserEmail,
  canInvite = false,
}: TeamMembersSectionProps) {
  const t = useTranslations("settings.team");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;

    async function loadMembers() {
      try {
        const response = await fetch("/api/settings/team/members");
        if (!response.ok) return;
        const body = (await response.json()) as { items?: TeamMemberItem[] };
        if (active && body.items) {
          setMembers(body.items);
        }
      } catch {
        // keep server-rendered fallback values
      }
    }

    void loadMembers();
    return () => {
      active = false;
    };
  }, []);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const normalizedQuery = query.trim().toLowerCase();
  const filteredMembers = members.filter((member) => {
    if (!normalizedQuery) return true;

    const displayEmail =
      member.user_id === currentUserId
        ? (member.email ?? currentUserEmail ?? "")
        : (member.email ?? "");
    const roleLabel = t(`roles.${member.role}`).toLowerCase();
    return (
      displayEmail.toLowerCase().includes(normalizedQuery) ||
      member.user_id.toLowerCase().includes(normalizedQuery) ||
      roleLabel.includes(normalizedQuery)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="grid max-w-xs flex-1 gap-1.5">
          <span className="text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
            {t("searchLabel")}
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)]"
          />
        </label>
        <div className="flex items-center gap-3">
          <p className="text-xs whitespace-nowrap text-[var(--color-fg-mute)]">
            {t("results", { count: filteredMembers.length })}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setQuery("")}
            disabled={!query}
          >
            {tCommon("clearFilters")}
          </Button>
        </div>
      </div>

      {!members.length ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--color-fg-mute)]">{t("emptyTeam")}</p>
        </div>
      ) : !filteredMembers.length ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--color-fg-mute)]">{t("emptySearch")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg)]">
              <tr className="border-b border-[var(--color-border)]">
                <Th>{t("columns.member")}</Th>
                <Th>{t("columns.role")}</Th>
                <Th>{t("columns.joined")}</Th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => (
                <tr
                  key={member.user_id}
                  className="border-b border-[var(--color-border)] transition-colors duration-[120ms] hover:bg-[var(--color-surface-mute)]"
                >
                  <Td>
                    {member.user_id === currentUserId
                      ? (member.email ?? currentUserEmail ?? t("currentUser"))
                      : (member.email ?? `${t("userId")} ${member.user_id.slice(0, 8)}`)}
                  </Td>
                  <Td>
                    <RoleBadge role={member.role} label={t(`roles.${member.role}`)} />
                  </Td>
                  <Td className="text-[var(--color-fg-subtle)]">
                    {dateFormatter.format(new Date(member.created_at))}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canInvite && <TeamInviteForm />}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-3 py-2.5 text-left text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-2.5 align-middle text-[var(--color-fg)] ${className ?? ""}`}>
      {children}
    </td>
  );
}

function RoleBadge({ role, label }: { role: string; label: string }) {
  const className =
    role === "owner"
      ? "border-[color:var(--color-blue)]/35 bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]"
      : "border-[var(--color-border)] bg-[var(--color-surface-mute)] text-[var(--color-fg-mute)]";

  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs ${className}`}
    >
      {label}
    </span>
  );
}
