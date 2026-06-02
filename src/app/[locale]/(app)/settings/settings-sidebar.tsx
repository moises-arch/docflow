"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  Activity,
  Bell,
  BrainCircuit,
  ScrollText,
  Building2,
  Radar,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

// ─── nav link ─────────────────────────────────────────────────────────────────

function NavLink({
  href,
  label,
  description,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 rounded-[var(--radius-sm)] px-3 py-2.5 transition-all duration-[120ms]",
        active
          ? "bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_var(--color-border)]"
          : "hover:bg-[var(--color-surface-mute)]",
      )}
    >
      {active && (
        <span className="absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-r bg-[var(--color-fg)]" />
      )}
      <Icon
        size={16}
        className={cn(
          "mt-px transition-colors duration-[120ms]",
          active ? "text-[var(--color-fg)]" : "text-[var(--color-fg-mute)]",
        )}
        aria-hidden
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "block truncate text-sm font-medium transition-colors duration-[120ms]",
            active ? "text-[var(--color-fg)]" : "text-[var(--color-fg-mute)]",
          )}
        >
          {label}
        </span>
        {description && (
          <span className="block truncate text-xs leading-tight text-[var(--color-fg-subtle)]">
            {description}
          </span>
        )}
      </span>
    </Link>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function SettingsSidebar({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("settings");

  const topItems: Array<{
    href: string;
    label: string;
    description?: string;
    icon: LucideIcon;
    ownerOnly?: boolean;
  }> = [
    {
      href: "/settings/general",
      label: t("general.title"),
      description: t("general.navDescription"),
      icon: Building2,
    },
    {
      href: "/settings/admin",
      label: t("admin.title"),
      description: t("admin.navDescription"),
      icon: ShieldCheck,
      ownerOnly: true,
    },
    {
      href: "/settings/admin/ai",
      label: t("ai.title"),
      description: t("ai.navDescription"),
      icon: BrainCircuit,
      ownerOnly: true,
    },
    {
      href: "/settings/admin/ai/prompts",
      label: t("prompts.title"),
      description: t("prompts.navDescription"),
      icon: ScrollText,
      ownerOnly: true,
    },
    {
      href: "/settings/admin/team",
      label: t("team.title"),
      description: t("team.navDescription"),
      icon: Users,
      ownerOnly: true,
    },
    {
      href: "/settings/admin/monitoring",
      label: t("monitoring.title"),
      description: t("monitoring.navDescription"),
      icon: Radar,
      ownerOnly: true,
    },
    {
      href: "/settings/admin/diagnostics",
      label: t("diagnostics.title"),
      description: t("diagnostics.navDescription"),
      icon: Activity,
      ownerOnly: true,
    },
    {
      href: "/settings/notifications",
      label: t("notifications.title"),
      description: t("notifications.navDescription"),
      icon: Bell,
      ownerOnly: true,
    },
  ];

  return (
    <aside className="flex h-full flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <div className="inline-flex items-center gap-2.5 text-sm font-medium text-[var(--color-fg)]">
          <Settings size={16} className="text-[var(--color-fg-mute)]" aria-hidden />
          <span>{t("title")}</span>
        </div>
      </div>

      {/* Nav — flat list (no collapsible groups) */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {topItems
          .filter((item) => !item.ownerOnly || isOwner)
          .map((item) => {
            // /settings/admin = exact match (no descendants), los demás aceptan descendants
            const active =
              item.href === "/settings/admin"
                ? pathname === "/settings/admin"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                description={item.description}
                icon={item.icon}
                active={active}
              />
            );
          })}
      </nav>
    </aside>
  );
}
