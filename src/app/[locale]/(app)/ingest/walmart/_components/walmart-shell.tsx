"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const TABS = [
  { href: "/ingest/walmart", label: "Resumen" },
  { href: "/ingest/walmart/orders", label: "Órdenes" },
  { href: "/ingest/walmart/performance", label: "Performance" },
  { href: "/ingest/walmart/buybox", label: "Buy Box" },
  { href: "/ingest/walmart/catalog", label: "Catálogo" },
  { href: "/ingest/walmart/inventory", label: "Inventario" },
  { href: "/ingest/walmart/pricing", label: "Pricing" },
  { href: "/ingest/walmart/returns", label: "Returns" },
  { href: "/ingest/walmart/financials", label: "Financiero" },
  { href: "/ingest/walmart/settings", label: "Configuración" },
] as const;

type TabHref = (typeof TABS)[number]["href"];

export function WalmartShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid gap-4">
      <header>
        <Link
          href="/ingest"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Volver al hub
        </Link>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/connector-logo.svg"
            alt="Marketplace Marketplace"
            width={120}
            height={32}
            className="h-8 w-auto"
          />
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Integración activa · API directa
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-fg-mute)]">
          Comando central para Marketplace Marketplace. Sincronización vía API oficial
          (<code className="font-mono text-xs">marketplace.walmartapis.com</code>) — webhook PO_CREATED + crons de respaldo + dashboard operativo.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-[var(--color-border)]">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href !== "/ingest/walmart" && pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href as TabHref}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors -mb-px border-b-2",
                active
                  ? "border-[var(--color-blue)] text-[var(--color-fg)]"
                  : "border-transparent text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] hover:border-[var(--color-border-hv)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <main>{children}</main>
    </div>
  );
}
