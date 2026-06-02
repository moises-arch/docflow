"use client";

import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  TrendingUp,
  Star,
  BookOpen,
  Package,
  DollarSign,
  RotateCcw,
  Banknote,
  Settings2,
  type LucideIcon,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
  { href: "/ingest/walmart",              label: "Resumen",       icon: LayoutDashboard },
  { href: "/ingest/walmart/orders",       label: "Órdenes",       icon: ShoppingCart    },
  { href: "/ingest/walmart/performance",  label: "Performance",   icon: TrendingUp      },
  { href: "/ingest/walmart/buybox",       label: "Buy Box",       icon: Star            },
  { href: "/ingest/walmart/catalog",      label: "Catálogo",      icon: BookOpen        },
  { href: "/ingest/walmart/inventory",    label: "Inventario",    icon: Package         },
  { href: "/ingest/walmart/pricing",      label: "Pricing",       icon: DollarSign      },
  { href: "/ingest/walmart/returns",      label: "Returns",       icon: RotateCcw       },
  { href: "/ingest/walmart/financials",   label: "Financiero",    icon: Banknote        },
  { href: "/ingest/walmart/settings",     label: "Configuración", icon: Settings2       },
];

function NavLink({ href, label, icon: Icon, active }: NavItem & { active: boolean }) {
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

export function WalmartSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]">
      {/* Header — logo */}
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <Image src="/connector-logo.svg" alt="Marketplace Marketplace" width={100} height={28} className="h-7 w-auto" />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {ITEMS.map((item) => {
          const active =
            item.href === "/ingest/walmart"
              ? pathname === "/ingest/walmart"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return <NavLink key={item.href} {...item} active={active} />;
        })}
      </nav>

      {/* Footer badge */}
      <div className="border-t border-[var(--color-border)] px-4 py-3">
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          API activa
        </span>
      </div>
    </aside>
  );
}
