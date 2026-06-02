"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Command, Zap, ZapOff, QrCode, RefreshCw, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { OdooAutoSyncToggle, ODOO_AUTOSYNC_KEY } from "./odoo-autosync-toggle";
import { QrScannerDialog } from "./qr-scanner-dialog";
import { OdooCatalogSyncDialog } from "./odoo-catalog-sync-dialog";
import { NotificationsBell } from "./notifications-bell";
import { IntegrationsDiagnosticsDialog } from "./integrations-diagnostics-dialog";

interface AppHeaderProps {
  onCommandOpen: () => void;
}

// Re-exports so other modules can read the auto-sync flag
export { ODOO_AUTOSYNC_KEY };
export function isOdooAutoSyncEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(ODOO_AUTOSYNC_KEY);
  // Default: ON (current behavior)
  return v === null ? true : v === "1";
}

// Tiny visible badge of current auto-sync state next to Cmd+K
function AutoSyncBadge() {
  const [enabled, setEnabled] = useState<boolean>(true);
  useEffect(() => {
    setEnabled(isOdooAutoSyncEnabled());
    const onChange = () => setEnabled(isOdooAutoSyncEnabled());
    window.addEventListener("storage", onChange);
    window.addEventListener("odoo-autosync-changed", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("odoo-autosync-changed", onChange);
    };
  }, []);
  return enabled ? (
    <Zap className="size-3 text-emerald-500" />
  ) : (
    <ZapOff className="size-3 text-amber-500" />
  );
}

// Map path segments to display labels
// Segments known to have a translation key in `breadcrumbs.*`.
// Anything else falls back to a Title-Cased version of the segment.
const KNOWN_SEGMENTS = new Set([
  "dashboard", "inbox", "ingest", "email", "portals", "browser",
  "review", "processed", "providers", "templates", "profile-studio",
  "integrations", "odoo", "settings", "general", "team", "mappings",
  "credits", "ai", "configuration", "source-target", "sku-mapping",
  "microsoft-365", "help", "pipeline", "tech-stack",
]);

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

function useBreadcrumbs(): BreadcrumbSegment[] {
  const pathname = usePathname();
  const tBc = useTranslations("breadcrumbs");
  const segments = pathname.split("/").filter(Boolean);

  const crumbs: BreadcrumbSegment[] = [];
  let accumulated = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    accumulated += `/${seg}`;

    // Skip UUIDs/IDs — show generic label instead
    const isId = /^[0-9a-f-]{8,}$/i.test(seg);
    const label = isId
      ? tBc("detail")
      : KNOWN_SEGMENTS.has(seg)
        ? tBc(seg)
        : seg.charAt(0).toUpperCase() + seg.slice(1);

    const isLast = i === segments.length - 1;
    crumbs.push({ label, href: isLast ? undefined : accumulated });
  }

  return crumbs;
}

export function AppHeader({ onCommandOpen }: AppHeaderProps) {
  const crumbs = useBreadcrumbs();
  const t = useTranslations("appHeader");

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
      {/* Sidebar toggle */}
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />

      {/* Breadcrumb */}
      <Breadcrumb className="flex-1">
        <BreadcrumbList>
          {crumbs.map((crumb, i) => (
            <Fragment key={i}>
              <BreadcrumbItem>
                {crumb.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {i < crumbs.length - 1 && <BreadcrumbSeparator />}
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Right cluster: auto-sync · QR · Cmd+K */}
      <div className="flex items-center gap-1">
        {/* ERP auto-sync indicator + popover toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <OdooAutoSyncToggle>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("h-7 gap-1 px-2 text-[11px]")}
                >
                  <AutoSyncBadge />
                  <span className="hidden sm:inline text-muted-foreground">{t("autoSync")}</span>
                </Button>
              </OdooAutoSyncToggle>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("approvedOrders")}</TooltipContent>
        </Tooltip>

        {/* QR public scanner */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <QrScannerDialog>
                <Button variant="ghost" size="icon" className="size-7" aria-label={t("publicScanner")}>
                  <QrCode className="size-3.5" />
                </Button>
              </QrScannerDialog>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("publicScannerTooltip")}</TooltipContent>
        </Tooltip>

        {/* ERP catalog sync */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <OdooCatalogSyncDialog>
                <Button variant="ghost" size="icon" className="size-7" aria-label={t("syncCatalog")}>
                  <RefreshCw className="size-3.5" />
                </Button>
              </OdooCatalogSyncDialog>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("syncCatalogTooltip")}</TooltipContent>
        </Tooltip>

        {/* Integrations diagnostics */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <IntegrationsDiagnosticsDialog>
                <Button variant="ghost" size="icon" className="size-7" aria-label={t("diagnostics")}>
                  <Activity className="size-3.5" />
                </Button>
              </IntegrationsDiagnosticsDialog>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("diagnosticsTooltip")}</TooltipContent>
        </Tooltip>

        {/* Notifications bell */}
        <NotificationsBell />

        {/* ⌘K shortcut */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
          onClick={onCommandOpen}
        >
          <Command className="size-3" />
          <span className="hidden sm:inline">{t("commands")}</span>
          <kbd className="font-mono text-[10px]">⌘K</kbd>
        </Button>
      </div>
    </header>
  );
}
