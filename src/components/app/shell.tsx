"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppHeader } from "@/components/app/app-header";
import { CommandPalette } from "@/components/app/command-palette";
import { EmailInboundDrawer } from "@/components/app/email-inbound-drawer";
import { KeyboardHelpOverlay } from "@/components/app/keyboard-help-overlay";
import { THEME_COOKIE_NAME, THEME_STORAGE_KEY, THEME_VARS } from "@/lib/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type ThemePreference = "light" | "dark" | "system";

interface ShellProps {
  children: ReactNode;
  user: { id: string; email: string; name?: string };
  /** Optional live counts for sidebar badges */
  counts?: { inbox?: number; review?: number };
}

// ─── Theme helpers ────────────────────────────────────────────────────────────

function isThemePreference(v: string | null): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system";
}

function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemePreference(pref: ThemePreference) {
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.themePreference = pref;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  for (const [name, value] of Object.entries(THEME_VARS[theme])) {
    root.style.setProperty(name, value);
  }
}

function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function Shell({ children, user, counts }: ShellProps) {
  const router = useRouter();
  const pendingGoToRef = useRef<number | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [emailDrawerOpen, setEmailDrawerOpen] = useState(false);
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>(getStoredThemePreference);

  function setThemePreference(pref: ThemePreference) {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
    // Cookie lets the server read preference on SSR to avoid FOUC
    document.cookie = `${THEME_COOKIE_NAME}=${pref}; max-age=31536000; path=/; SameSite=Lax`;
    setThemePreferenceState(pref);
    applyThemePreference(pref);
  }

  // ── Theme sync ──────────────────────────────────────────────────────────────
  useEffect(() => {
    applyThemePreference(themePreference);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => {
      if (themePreference === "system") applyThemePreference("system");
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next = isThemePreference(e.newValue) ? e.newValue : "system";
      setThemePreferenceState(next);
      applyThemePreference(next);
    };
    media.addEventListener("change", onMedia);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onMedia);
      window.removeEventListener("storage", onStorage);
    };
  }, [themePreference]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
    }

    function nav(
      path:
        | "/dashboard"
        | "/inbox"
        | "/ingest"
        | "/review"
        | "/processed"
        | "/templates"
        | "/integrations"
        | "/settings",
    ) {
      router.push(path);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;

      if (!mod && !e.altKey && !e.shiftKey && key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      if (mod && !e.altKey) {
        if (key === "k") {
          e.preventDefault();
          setCommandOpen(true);
          return;
        }
        if (key === "1") {
          e.preventDefault();
          nav("/dashboard");
          return;
        }
        if (key === "2") {
          e.preventDefault();
          nav("/inbox");
          return;
        }
        if (key === "3") {
          e.preventDefault();
          nav("/ingest");
          return;
        }
        if (key === "4") {
          e.preventDefault();
          nav("/review");
          return;
        }
        if (key === "5") {
          e.preventDefault();
          nav("/processed");
          return;
        }
        if (key === "6") {
          e.preventDefault();
          nav("/templates");
          return;
        }
        if (key === "7") {
          e.preventDefault();
          nav("/integrations");
          return;
        }
        if (key === ",") {
          e.preventDefault();
          nav("/settings");
          return;
        }
      }

      const now = Date.now();
      if (key === "g" && !mod && !e.altKey && !e.shiftKey) {
        pendingGoToRef.current = now;
        return;
      }
      if (!mod && !e.altKey && !e.shiftKey) {
        const pending = pendingGoToRef.current;
        if (pending !== null && now - pending <= 900) {
          const map: Record<string, Parameters<typeof nav>[0]> = {
            d: "/dashboard",
            i: "/inbox",
            h: "/ingest",
            r: "/review",
            p: "/processed",
            v: "/templates",
            n: "/integrations",
            s: "/settings",
          };
          if (key in map) {
            e.preventDefault();
            nav(map[key]);
          }
        }
      }
      pendingGoToRef.current = null;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          user={user}
          counts={counts}
          onCommandOpen={() => setCommandOpen(true)}
          onEmailInboundOpen={() => setEmailDrawerOpen(true)}
          themePreference={themePreference}
          onThemeChange={setThemePreference}
        />

        <SidebarInset
          className="min-h-0 overflow-hidden transition-[height] duration-200 md:!mb-0"
          style={emailDrawerOpen ? { height: "30vh", minHeight: "30vh" } : undefined}
        >
          <AppHeader onCommandOpen={() => setCommandOpen(true)} />
          {/*
            Main slot — bounded height, no outer scroll.
            Each page decides its own scroll strategy:
              · h-full + internal scroll context (inbox: Card with DataGridScrollArea)
              · h-full overflow-y-auto (dashboard, help, integrations, …)
          */}
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <div className="absolute inset-0 flex flex-col">{children}</div>
          </main>
        </SidebarInset>

        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onNavigate={(path) => router.push(path)}
        />

        <KeyboardHelpOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

        <EmailInboundDrawer
          open={emailDrawerOpen}
          onOpenChange={setEmailDrawerOpen}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}
