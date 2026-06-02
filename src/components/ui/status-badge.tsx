"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Document lifecycle states — matches data.md state machine
export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "needs_review"
  | "reviewed"
  | "archived"
  | "failed_processing"
  | "rejected";

// ERP sync states
export type SyncStatus = "none" | "pending" | "in_progress" | "synced" | "sync_failed";

export type BadgeVariant = DocumentStatus | SyncStatus;

const variantStyles: Record<BadgeVariant, string> = {
  // Document states
  uploaded:
    "bg-[color:var(--color-slate)]/10 text-[color:var(--color-slate)] border-[color:var(--color-slate)]/20",
  processing:
    "bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)] border-[color:var(--color-blue)]/20",
  needs_review:
    "bg-[color:var(--color-amber)]/10 text-[color:var(--color-amber)] border-[color:var(--color-amber)]/20",
  reviewed:
    "bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)] border-[color:var(--color-teal)]/20",
  archived:
    "bg-[var(--color-surface-mute)] text-[var(--color-fg-mute)] border-[var(--color-border)]",
  failed_processing:
    "bg-[color:var(--color-rose)]/10 text-[color:var(--color-rose)] border-[color:var(--color-rose)]/20",
  rejected:
    "bg-[var(--color-surface-mute)] text-[var(--color-fg-mute)] border-[var(--color-border)]",
  // Sync states
  none: "bg-[var(--color-surface-mute)] text-[var(--color-fg-mute)] border-[var(--color-border)]",
  pending:
    "bg-[color:var(--color-slate)]/10 text-[color:var(--color-slate)] border-[color:var(--color-slate)]/20",
  in_progress:
    "bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)] border-[color:var(--color-blue)]/20",
  synced:
    "bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)] border-[color:var(--color-teal)]/20",
  sync_failed:
    "bg-[color:var(--color-rose)]/10 text-[color:var(--color-rose)] border-[color:var(--color-rose)]/20",
};

// Dot colors match the text/border color
const dotColors: Record<BadgeVariant, string> = {
  uploaded: "bg-[color:var(--color-slate)]",
  processing: "bg-[color:var(--color-blue)]",
  needs_review: "bg-[color:var(--color-amber)]",
  reviewed: "bg-[color:var(--color-teal)]",
  archived: "bg-[var(--color-fg-mute)]",
  failed_processing: "bg-[color:var(--color-rose)]",
  rejected: "bg-[var(--color-fg-mute)]",
  none: "bg-[var(--color-fg-mute)]",
  pending: "bg-[color:var(--color-slate)]",
  in_progress: "bg-[color:var(--color-blue)]",
  synced: "bg-[color:var(--color-teal)]",
  sync_failed: "bg-[color:var(--color-rose)]",
};

// States where the dot pulses to indicate live activity
const ANIMATED = new Set<BadgeVariant>(["processing", "in_progress"]);

const defaultLabels: Record<BadgeVariant, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  needs_review: "Needs review",
  reviewed: "Reviewed",
  archived: "Archived",
  failed_processing: "Failed",
  rejected: "Rejected",
  none: "Not synced",
  pending: "Pending",
  in_progress: "Syncing",
  synced: "Synced",
  sync_failed: "Sync failed",
};

interface StatusBadgeProps {
  status: BadgeVariant;
  /** Override the auto-translated label. Useful for custom states. */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const tStatus = useTranslations("status");
  // Resolve i18n label; fall back to English default for unknown variants.
  const resolved = label ?? (status in defaultLabels ? tStatus(status) : (defaultLabels as Record<string, string>)[status] ?? status);
  return (
    <span
      role="status"
      aria-label={resolved}
      className={cn(
        "inline-flex items-center gap-1.5",
        "h-5 rounded-[var(--radius-sm)] border px-1.5",
        "text-xs font-medium",
        "whitespace-nowrap",
        variantStyles[status],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 shrink-0",
          "rounded-md",
          dotColors[status],
          ANIMATED.has(status) && "animate-pulse",
        )}
      />
      {resolved}
    </span>
  );
}
