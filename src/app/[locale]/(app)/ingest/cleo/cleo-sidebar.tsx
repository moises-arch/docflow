"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  PackageOpen,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  heading: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    heading: "MONITOREO",
    items: [
      { href: "/ingest/cleo", label: "Resumen", icon: LayoutDashboard },
    ],
  },
  {
    heading: "ÓRDENES",
    items: [
      { href: "/ingest/cleo/historial", label: "Historial", icon: ClipboardList },
    ],
  },
  {
    heading: "REFERENCIA",
    items: [
      { href: "/ingest/cleo/documentacion", label: "Documentación", icon: BookOpen },
    ],
  },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2.5 rounded-[var(--radius-sm)] py-2 pl-3 pr-3 text-sm transition-all duration-[120ms]",
        active
          ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-[inset_0_0_0_1px_var(--color-border)]"
          : "text-[var(--color-fg-mute)] hover:bg-[var(--color-surface-mute)] hover:text-[var(--color-fg)]",
      )}
    >
      {active && (
        <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-r bg-[var(--color-fg)]" />
      )}
      <Icon size={14} aria-hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</span>
    </Link>
  );
}

export function CleoSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <div className="inline-flex items-center gap-2.5 text-sm font-medium text-[var(--color-fg)]">
          <PackageOpen size={16} className="text-[var(--color-fg-mute)]" aria-hidden />
          <span>Supplier Portal</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group) => (
          <div key={group.heading} className="mb-4">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-mute)]">
              {group.heading}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/ingest/cleo"
                    ? pathname === "/ingest/cleo"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={active}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
