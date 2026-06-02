"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; label: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["⌘", "1"], label: "Dashboard" },
      { keys: ["⌘", "2"], label: "Inbox" },
      { keys: ["⌘", "3"], label: "Ingest Hub" },
      { keys: ["⌘", "4"], label: "Review" },
      { keys: ["⌘", "5"], label: "Processed" },
      { keys: ["⌘", "6"], label: "Templates" },
      { keys: ["⌘", ","], label: "Settings" },
      { keys: ["⌘", "K"], label: "Command palette" },
    ],
  },
  {
    title: "Go-to (press G then...)",
    shortcuts: [
      { keys: ["G", "D"], label: "Dashboard" },
      { keys: ["G", "I"], label: "Inbox" },
      { keys: ["G", "R"], label: "Review" },
      { keys: ["G", "P"], label: "Processed" },
      { keys: ["G", "V"], label: "Templates" },
      { keys: ["G", "S"], label: "Settings" },
    ],
  },
  {
    title: "Review workspace",
    shortcuts: [
      { keys: ["A"], label: "Approve document" },
      { keys: ["R"], label: "Reject document" },
      { keys: ["T"], label: "Switch to Template tab" },
      { keys: ["J"], label: "Next document" },
      { keys: ["K"], label: "Previous document" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { keys: ["?"], label: "Show keyboard shortcuts" },
      { keys: ["Esc"], label: "Close overlay / cancel" },
    ],
  },
];

interface KeyboardHelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardHelpOverlay({ open, onClose }: KeyboardHelpOverlayProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-hidden="true" />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-fg)]">Keyboard shortcuts</h2>
            <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
              Press <Kbd>?</Kbd> to toggle this overlay
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-fg-mute)] transition-colors hover:bg-[var(--color-surface-mute)] hover:text-[var(--color-fg)]"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-0 gap-x-8 gap-y-6 p-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-3 text-[10px] font-semibold tracking-widest text-[var(--color-fg-subtle)] uppercase">
                {group.title}
              </h3>
              <ul className="space-y-2">
                {group.shortcuts.map((s) => (
                  <li key={s.keys.join("+")} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[var(--color-fg-mute)]">{s.label}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-6 py-3">
          <p className="text-xs text-[var(--color-fg-subtle)]">
            Shortcuts are disabled when focus is inside an input field.
          </p>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border px-1",
        "border-[var(--color-border)] bg-[var(--color-surface-mute)]",
        "font-mono text-[10px] font-medium text-[var(--color-fg-mute)]",
        "leading-none tracking-tight",
      )}
    >
      {children}
    </kbd>
  );
}
