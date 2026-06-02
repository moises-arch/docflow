"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Zap, ZapOff, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const ODOO_AUTOSYNC_KEY = "intake:odoo-autosync";

interface Props {
  children: ReactNode;
}

export function OdooAutoSyncToggle({ children }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [saving, setSaving] = useState(false);

  // Load from DB on mount
  useEffect(() => {
    fetch("/api/settings/auto-approve")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => {
        const val = d.enabled ?? false;
        setEnabled(val);
        // Keep localStorage in sync for client-side reads in approve-button
        if (typeof window !== "undefined") {
          window.localStorage.setItem(ODOO_AUTOSYNC_KEY, val ? "1" : "0");
          window.dispatchEvent(new Event("odoo-autosync-changed"));
        }
      })
      .catch(() => {
        // Fallback to localStorage if API unavailable
        const v = typeof window !== "undefined"
          ? window.localStorage.getItem(ODOO_AUTOSYNC_KEY)
          : null;
        setEnabled(v === "1" || v === null);
      });
  }, []);

  async function update(next: boolean) {
    setSaving(true);
    try {
      await fetch("/api/settings/auto-approve", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      setEnabled(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ODOO_AUTOSYNC_KEY, next ? "1" : "0");
        window.dispatchEvent(new Event("odoo-autosync-changed"));
      }
    } finally {
      setSaving(false);
    }
  }

  const isEnabled = enabled ?? false;

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-80 p-0">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border bg-card px-4 py-3">
          <div className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
            isEnabled
              ? "bg-emerald-500/12 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
              : "bg-amber-500/12 text-amber-600 ring-amber-500/20 dark:text-amber-400",
          )}>
            {enabled === null
              ? <Loader2 size={17} className="animate-spin" />
              : isEnabled
                ? <Zap size={17} strokeWidth={2.25} />
                : <ZapOff size={17} strokeWidth={2.25} />
            }
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-foreground">
              Auto-approve & sync
            </p>
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              When ON, clean documents go directly to ERP after AI extraction — no human review needed.
            </p>
          </div>
        </div>

        {/* Toggle row */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-foreground">
              {isEnabled ? "Automatic — zero touch" : "Manual approval required"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {isEnabled
                ? "Documents with no issues are approved and synced instantly."
                : "Every order must be manually approved before syncing to ERP."}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(v) => void update(v)}
            disabled={saving || enabled === null}
          />
        </div>

        {/* Status banner */}
        <div className={cn(
          "border-t px-4 py-2.5 text-[10.5px]",
          isEnabled
            ? "border-emerald-500/15 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
            : "border-amber-500/15 bg-amber-500/5 text-amber-700 dark:text-amber-400",
        )}>
          <span className="inline-flex items-start gap-1.5">
            {isEnabled ? (
              <>
                <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span><strong>ON</strong> — Perfect orders flow to ERP automatically. Documents with missing fields or unresolved templates still require manual approval.</span>
              </>
            ) : (
              <>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span><strong>OFF</strong> — All orders queue for manual approval before syncing.</span>
              </>
            )}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
