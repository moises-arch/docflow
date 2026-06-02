"use client";

import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface BulkAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
  separator?: boolean; // adds a separator above this item
}

interface BulkActionBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClearSelection: () => void;
}

export function BulkActionBar({ selectedCount, actions, onClearSelection }: BulkActionBarProps) {
  const t = useTranslations("common");

  return (
    <div
      aria-live="polite"
      className={cn(
        "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-200",
        selectedCount > 0
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 shadow-lg shadow-black/10">
        {/* Count badge */}
        <span className="text-sm font-medium text-[var(--color-fg)] tabular-nums">
          {t("bulkSelected", { count: selectedCount })}
        </span>

        <div className="h-4 w-px bg-[var(--color-border)]" />

        {/* Actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="default" className="h-7 gap-1.5 px-3 text-xs">
              {t("bulkActions")}
              <ChevronDown size={11} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" sideOffset={8} className="min-w-[160px]">
            {actions.map((action, i) => (
              <span key={i}>
                {action.separator && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={action.onClick}
                  className={cn(
                    "gap-2 text-xs",
                    action.destructive && "text-destructive focus:text-destructive",
                  )}
                >
                  <action.icon size={13} aria-hidden="true" />
                  {action.label}
                </DropdownMenuItem>
              </span>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Clear selection */}
        <button
          type="button"
          onClick={onClearSelection}
          aria-label={t("clearSelection")}
          className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-fg-mute)] transition-colors hover:bg-[var(--color-surface-mute)] hover:text-[var(--color-fg)]"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
