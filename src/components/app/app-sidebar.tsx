"use client";

import * as React from "react";
import { usePathname, Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/browser";
import { getInitials } from "@/lib/utils";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import {
  LayoutDashboard,
  Inbox,
  Mail,
  Package2,
  Store,
  FileBox,
  ScanEye,
  ListChecks,
  PackageSearch,
  Settings2,
  HelpCircle,
  PlugZap,
  Globe,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Check,
} from "lucide-react";
import { AppLogo } from "@/components/app/app-logo";
import { AppIcon } from "@/components/app/app-icon";

// ─── Types ────────────────────────────────────────────────────────────────────

type ThemePreference = "light" | "dark" | "system";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: { id: string; email: string; name?: string };
  onCommandOpen: () => void;
  onEmailInboundOpen: () => void;
  themePreference: ThemePreference;
  onThemeChange: (t: ThemePreference) => void;
  counts?: { inbox?: number; review?: number };
}

type SidebarCostItem = {
  id: string;
  original_name: string;
  state: string;
  created_at: string;
  cost_usd: number | null;
};

// ─── Nav data ────────────────────────────────────────────────────────────────

const PLATFORM_ITEMS = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, shortcut: "⌘1" },
  { href: "/inbox", labelKey: "inbox", icon: Inbox, shortcut: "⌘2" },
  { href: "/review", labelKey: "review", icon: ScanEye, shortcut: "⌘4" },
  { href: "/processed", labelKey: "processed", icon: ListChecks, shortcut: "⌘5" },
  { href: "/templates", labelKey: "providers", icon: PackageSearch, shortcut: "⌘6" },
] as const;

// Plugin links — proper nouns, no i18n needed
const PLUGIN_ITEMS = [
  { href: "/ingest/rithum",                   label: "Supplier Portal OrderStream",  icon: Package2 },
  { href: "/ingest/walmart",                  label: "Marketplace Marketplace", icon: Store    },
  { href: "/ingest/cleo",                     label: "Supplier Portal",         icon: FileBox  },
  { href: "/ingest/email/microsoft-365",      label: "Email provider",       icon: Mail     },
] as const;


const THEME_OPTIONS: { value: ThemePreference; icon: React.ElementType; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

// ─── AppSidebar ───────────────────────────────────────────────────────────────

export function AppSidebar({
  user,
  onCommandOpen: _onCommandOpen,
  onEmailInboundOpen,
  themePreference,
  onThemeChange,
  counts,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isConfigActive =
    pathname.startsWith("/ingest") ||
    pathname.startsWith("/integrations");
  const [costItems, setCostItems] = React.useState<SidebarCostItem[]>([]);
  const [costDialogOpen, setCostDialogOpen] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    async function loadCosts() {
      try {
        const response = await fetch("/api/sidebar/document-costs", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { items?: SidebarCostItem[] };
        if (active) setCostItems(Array.isArray(body.items) ? body.items.slice(0, 6) : []);
      } catch {
        if (active) setCostItems([]);
      }
    }

    void loadCosts();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <SidebarHeader className="pb-3">
        {/* Logo — expanded: wordmark full-width; collapsed: CA badge */}
        <Link href="/dashboard" className="flex items-center outline-none">
          {/* COLLAPSED state only — DocFlow icon */}
          <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center mx-auto">
            <AppIcon size={36} className="rounded-[6px]" />
          </div>

          {/* EXPANDED state only — full wordmark */}
          <div className="group-data-[collapsible=icon]:hidden flex flex-col items-center gap-1.5 px-1 py-1.5 w-full">
            <AppLogo
              variant="full"
              className="w-full h-auto"
              style={{ color: "var(--sidebar-foreground)" }}
            />
            <span
              className="w-full text-center text-[8px] font-semibold tracking-[0.2em] uppercase"
              style={{ color: "var(--sidebar-foreground)", opacity: 0.35 }}
            >
              AI Document Processing
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarSeparator className="mx-0" />

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <SidebarContent>
        {/* Group: main nav */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {PLATFORM_ITEMS.map(({ href, labelKey, icon: Icon, shortcut }) => {
                const isActive =
                  pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
                const badgeCount =
                  href === "/inbox"
                    ? counts?.inbox
                    : href === "/review"
                      ? counts?.review
                      : undefined;
                const label = t(labelKey);

                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>

                    {badgeCount != null && badgeCount > 0 && (
                      <SidebarMenuBadge>{badgeCount}</SidebarMenuBadge>
                    )}

                    {!isCollapsed && (
                      <SidebarMenuAction showOnHover aria-label={`Shortcut: ${shortcut}`}>
                        <span className="text-sidebar-foreground/35 pointer-events-none font-mono text-[10px] select-none">
                          {shortcut}
                        </span>
                      </SidebarMenuAction>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Help + Email Inbound — pinned above Configuration */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/help")}
                  tooltip={t("help")}
                >
                  <Link href="/help">
                    <HelpCircle />
                    <span>{t("help")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={onEmailInboundOpen}
                  tooltip="Email Inbound"
                >
                  <Inbox />
                  <span>Email Inbound</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Group: Configuration — pinned to bottom */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {isCollapsed ? (
                /* Sidebar colapsado — DropdownMenu con todos los plugins */
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        isActive={isConfigActive}
                        tooltip={t("configuration")}
                      >
                        <Settings2 />
                        <span>{t("configuration")}</span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="right"
                      align="end"
                      sideOffset={8}
                      alignOffset={-12}
                      className="w-56"
                    >
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
                        {t("configuration")}
                      </DropdownMenuLabel>
                      {PLUGIN_ITEMS.map(({ href, label, icon: Icon }) => (
                        <DropdownMenuItem key={href} asChild>
                          <Link href={href} className="gap-2">
                            <Icon className="size-4 shrink-0" />
                            <span>{label}</span>
                          </Link>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/integrations/odoo" className="gap-2">
                          <PlugZap className="size-4 shrink-0" />
                          <span>{t("odoo19")}</span>
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ) : (
                /* Sidebar expandido — Collapsible inline */
                <Collapsible asChild defaultOpen={isConfigActive} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton isActive={isConfigActive} tooltip={t("configuration")}>
                        <Settings2 />
                        <span>{t("configuration")}</span>
                        <ChevronRight className="ml-auto size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {/* Plugins directos */}
                        {PLUGIN_ITEMS.map(({ href, label, icon: Icon }) => (
                          <SidebarMenuSubItem key={href}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname.startsWith(href)}
                            >
                              <Link href={href}>
                                <Icon />
                                <span>{label}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}

                        {/* Separador visual */}
                        <div className="my-1 mx-2 h-px bg-sidebar-border/50" />

                        {/* ERP */}
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname.startsWith("/integrations")}
                          >
                            <Link href="/integrations/odoo">
                              <PlugZap />
                              <span>{t("odoo19")}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("processingCosts")}</DialogTitle>
            <DialogDescription>Recent document processing costs</DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-1">
            {costItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--color-fg-mute)]">No items</p>
            ) : (
              costItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-mute)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{item.original_name}</p>
                    <p className="text-[10px] text-[var(--color-fg-subtle)]">
                      {new Date(item.created_at).toLocaleString([], {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--color-fg-mute)]">
                    {item.cost_usd === null ? "—" : `$${item.cost_usd.toFixed(4)}`}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SidebarSeparator className="mx-0" />

      {/* ── Footer: user + theme ─────────────────────────────────────────── */}
      <SidebarFooter className="pb-2">
        <NavUser user={user} themePreference={themePreference} onThemeChange={onThemeChange} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

// ─── NavUser ──────────────────────────────────────────────────────────────────

function NavUser({
  user,
  themePreference,
  onThemeChange,
}: {
  user: { id: string; email: string; name?: string };
  themePreference: ThemePreference;
  onThemeChange: (t: ThemePreference) => void;
}) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const locale = useLocale();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  const displayName = user.name ?? user.email;
  const initials = getInitials(displayName);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              tooltip={displayName}
            >
              <Avatar className="size-7 rounded-md">
                <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground rounded-md text-[11px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                {user.name && (
                  <span className="text-sidebar-foreground/50 truncate text-[11px]">
                    {user.email}
                  </span>
                )}
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-52 rounded-md"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={6}
          >
            {/* User info header */}
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2.5 px-2 py-2">
                <Avatar className="size-8 rounded-md">
                  <AvatarFallback className="rounded-md text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{displayName}</span>
                  {user.name && (
                    <span className="truncate text-xs text-[var(--color-fg-subtle)]">{user.email}</span>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            {/* Theme selection */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1 text-[10px] tracking-wide text-[var(--color-fg-subtle)] uppercase">
                Theme
              </DropdownMenuLabel>
              {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => onThemeChange(value)}
                  className="gap-2"
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {themePreference === value && (
                    <Check className="size-3.5 text-[var(--color-fg-subtle)]" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            {/* Account actions */}
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="gap-2">
                  <Settings2 className="size-4 shrink-0" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.replace("/", { locale: locale === "en" ? "es" : "en" })}
                className="gap-2"
              >
                <Globe className="size-4 shrink-0" />
                {locale === "en" ? "Español" : "English"}
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive gap-2"
            >
              <LogOut className="size-4 shrink-0" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
