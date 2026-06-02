"use client";

import { StatusBadge, type BadgeVariant } from "@/components/ui/status-badge";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { MapPin, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// After this many ms, an in_progress state is considered stuck and retryable from the UI.
const IN_PROGRESS_STUCK_MS = 3 * 60 * 1000;

interface ProcessedSyncCellProps {
  syncState: string;
  draftId: string | null;
  odooSoId?: number | null;
  lastSyncError?: string | null;
  updatedAt?: string | null;
}

export function ProcessedSyncCell({
  syncState,
  draftId,
  odooSoId,
  lastSyncError,
  updatedAt,
}: ProcessedSyncCellProps) {
  const tStatus = useTranslations("status");
  const tProcessed = useTranslations("processed");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fixingAddresses, setFixingAddresses] = useState(false);
  const [localState, setLocalState] = useState(syncState);

  const isStuckInProgress =
    localState === "in_progress" &&
    updatedAt &&
    // eslint-disable-next-line react-hooks/purity -- This is an intentionally time-based retry affordance.
    Date.now() - new Date(updatedAt).getTime() > IN_PROGRESS_STUCK_MS;

  async function retrySync() {
    if (!draftId || loading) return;
    setLoading(true);

    try {
      const response = await fetch(`/api/order-drafts/${draftId}/retry-sync`, { method: "POST" });
      if (!response.ok) {
        throw new Error("retry_failed");
      }

      setLocalState("pending");
      toast.success(tProcessed("retrySyncSuccess"));
      router.refresh();
    } catch {
      toast.error(tProcessed("retrySyncFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function fixAddresses() {
    if (!draftId || fixingAddresses) return;
    setFixingAddresses(true);

    try {
      const response = await fetch(`/api/order-drafts/${draftId}/fix-odoo-addresses`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "fix_failed");
      }
      toast.success(tProcessed("fixAddressesSuccess"));
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`${tProcessed("fixAddressesFailed")}: ${msg}`);
    } finally {
      setFixingAddresses(false);
    }
  }

  // Synced + linked SO → show badge + Fix Addresses button
  if (localState === "synced" && draftId && odooSoId) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          <StatusBadge status="synced" label={tStatus("synced")} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={fixAddresses}
                disabled={fixingAddresses}
                aria-label={tProcessed("fixAddresses")}
                className="inline-flex items-center justify-center rounded p-0.5 text-[var(--color-fg-subtle)] opacity-0 transition-all duration-[120ms] hover:text-[var(--color-fg)] focus-visible:opacity-100 focus-visible:outline-none group-hover/row:opacity-100"
              >
                <MapPin
                  size={11}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={cn(fixingAddresses && "animate-pulse")}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              {tProcessed("fixAddresses")}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  // Sync failed or stuck → show retry button
  if ((localState === "sync_failed" || isStuckInProgress) && draftId) {
    const badge = (
      <button
        type="button"
        onClick={retrySync}
        disabled={loading}
        aria-label={tProcessed("retrySync")}
        className="group/retry inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-fg)]/20 focus-visible:outline-none"
      >
        <StatusBadge
          status="sync_failed"
          label={loading ? tStatus("pending") : tStatus(localState)}
        />
        <RotateCcw
          size={11}
          strokeWidth={2}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-[var(--color-fg-subtle)]",
            "opacity-0 transition-opacity duration-[120ms] group-hover/retry:opacity-100",
            loading && "animate-spin opacity-100",
          )}
        />
      </button>
    );

    if (lastSyncError) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{badge}</TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs text-xs break-words">
              {lastSyncError}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return badge;
  }

  return <StatusBadge status={localState as BadgeVariant} label={tStatus(localState)} />;
}
