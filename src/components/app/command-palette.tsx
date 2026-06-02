"use client";

import { Command } from "cmdk";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

type AppPath =
  | "/inbox"
  | "/ingest"
  | "/review"
  | "/processed"
  | "/templates"
  | "/integrations"
  | "/settings";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (path: AppPath) => void;
}

export function CommandPalette({ open, onOpenChange, onNavigate }: CommandPaletteProps) {
  const t = useTranslations("command");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  const actions: Array<{ id: string; label: string; shortcut: string; path: AppPath }> = [
    { id: "inbox", label: t("action.inbox"), shortcut: "⌘1", path: "/inbox" },
    { id: "ingest", label: t("action.ingestHub"), shortcut: "⌘2", path: "/ingest" },
    { id: "review", label: t("action.review"), shortcut: "⌘3", path: "/review" },
    { id: "processed", label: t("action.processed"), shortcut: "⌘4", path: "/processed" },
    { id: "providers", label: t("action.providers"), shortcut: "⌘5", path: "/templates" },
    { id: "integrations", label: t("action.integrations"), shortcut: "⌘7", path: "/integrations" },
    { id: "settings", label: t("action.settings"), shortcut: "⌘,", path: "/settings" },
  ];

  const helpShortcuts = [
    { id: "help-1", label: t("help.open"), shortcut: "⌘K" },
    { id: "help-2", label: t("help.inbox"), shortcut: "⌘1 · g i" },
    { id: "help-3", label: t("help.ingestHub"), shortcut: "⌘2 · g h" },
    { id: "help-4", label: t("help.review"), shortcut: "⌘3" },
    { id: "help-5", label: t("help.processed"), shortcut: "⌘4 · g p" },
    { id: "help-6", label: t("help.providers"), shortcut: "⌘5 · g v" },
    { id: "help-7", label: t("help.integrations"), shortcut: "⌘7 · g n" },
    { id: "help-8", label: t("help.settings"), shortcut: "⌘, · g s" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div className="mx-auto mt-24 w-full max-w-xl px-4">
        <Command
          label={t("title")}
          onClick={(event) => event.stopPropagation()}
          className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <Command.Input
              ref={inputRef}
              placeholder={t("placeholder")}
              className="h-8 w-full border-0 bg-transparent text-sm text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-subtle)]"
            />
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-[var(--color-fg-subtle)] [&_[cmdk-group-heading]]:uppercase">
            <Command.Empty className="px-2.5 py-8 text-center text-sm text-[var(--color-fg-mute)]">
              {t("empty")}
            </Command.Empty>

            <Command.Group heading={t("section.navigate")}>
              {actions.map((action) => (
                <Command.Item
                  key={action.id}
                  value={action.label}
                  onSelect={() => {
                    onNavigate(action.path);
                    onOpenChange(false);
                  }}
                  className="flex cursor-pointer items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[var(--color-fg)] outline-none data-[selected=true]:bg-[var(--color-surface-mute)]"
                >
                  <span>{action.label}</span>
                  <kbd className="font-mono text-[11px] text-[var(--color-fg-subtle)]">
                    {action.shortcut}
                  </kbd>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading={t("section.help")}>
              {helpShortcuts.map((entry) => (
                <Command.Item
                  key={entry.id}
                  value={entry.label}
                  disabled
                  className="flex items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[var(--color-fg-mute)] data-[disabled=true]:opacity-100"
                >
                  <span>{entry.label}</span>
                  <kbd className="font-mono text-[11px] text-[var(--color-fg-subtle)]">
                    {entry.shortcut}
                  </kbd>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
