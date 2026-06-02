"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { CelebrationToast, useCelebration } from "@/components/app/celebration";

interface ApproveButtonProps {
  draftId: string;
  /** @deprecated kept for compat; client-side check disabled in favor of server validation */
  missingRequiredLabels?: string[];
  beforeApprove?: () => Promise<boolean>;
}

type ApprovalError = {
  error?: string;
  detail?: string;
  fields?: Array<{ label?: string }>;
  existing_odoo_so_name?: string | null;
  existing_draft_id?: string | null;
};

const APPROVED_COUNT_KEY = "intake:approved-count";

export function ApproveButton({
  draftId,
  beforeApprove,
}: ApproveButtonProps) {
  const t = useTranslations("review");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activeMilestone, setActiveMilestone] = useState<
    Parameters<typeof CelebrationToast>[0]["milestone"] | null
  >(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    detail: string;
    existingSo: string | null;
  } | null>(null);
  const [forceLoading, setForceLoading] = useState(false);
  const { celebrate } = useCelebration();

  async function approve(opts?: { force?: boolean }) {
    const force = opts?.force === true;
    if (force) setForceLoading(true);
    else setLoading(true);

    // Save first to persist auto-resolved product IDs and any pending edits.
    // The server then validates against fresh DB data — its 422 response
    // tells us about any genuinely missing required fields.
    // We intentionally skip the client-side missingRequiredLabels check here:
    // it captures stale state via closure and produces false positives when
    // products are auto-resolved via catalog suggestions but not yet persisted.
    if (!force && beforeApprove) {
      const saved = await beforeApprove();
      if (!saved) {
        setLoading(false);
        return;
      }
    }

    // Honor user's auto-sync preference (header toggle). When OFF, ask the
    // server to mark the draft approved but skip the ERP push.
    const autoSync = (() => {
      if (typeof window === "undefined") return true;
      const v = window.localStorage.getItem("intake:odoo-autosync");
      return v === null ? true : v === "1";
    })();
    if (!force && !autoSync) {
      toast.message(t("toasts.autoSyncOff"), {
        description: t("toasts.autoSyncOffDescription"),
      });
    }
    const response = await fetch(`/api/order-drafts/${draftId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skip_odoo_sync: !autoSync, force_duplicate_po: force }),
    });

    if (!response.ok) {
      setLoading(false);
      setForceLoading(false);
      let body: ApprovalError = {};
      try {
        body = (await response.json()) as ApprovalError;
      } catch {
        body = {};
      }
      if (response.status === 409 && body.error === "duplicate_po_number") {
        // Abrimos el dialog de force-approve y dejamos que el usuario decida.
        setDuplicateInfo({
          detail: body.detail ?? "",
          existingSo: body.existing_odoo_so_name ?? null,
        });
        return;
      }
      if (response.status === 422 && body.error === "missing_required_fields") {
        const labels = body.fields?.map((field) => field.label).filter(Boolean) ?? [];
        toast.error(
          t("required.missingToast", {
            fields: labels.slice(0, 4).join(", "),
            count: labels.length,
          }),
        );
      } else if (response.status === 422 && body.error === "provider_unresolved") {
        toast.error(t("toasts.providerUnresolvedBeforeApprove"));
      } else if (response.status === 422 && body.error === "buyer_unresolved") {
        toast.error(
          body.detail ?? t("toasts.buyerUnresolved"),
          { duration: 8000 },
        );
      } else if (response.status === 409 && body.error === "duplicate_po") {
        const so = body.existing_odoo_so_name;
        toast.error(
          so
            ? t("toasts.duplicatePoWithSo", { so })
            : (body.detail ?? t("toasts.duplicatePo")),
          { duration: 8000 },
        );
      } else if (body.error === "odoo_connection_inactive") {
        toast.error(body.detail ?? t("toasts.odooConnectionInactive"));
      } else if (body.error === "odoo_sync_failed") {
        toast.error(
          t("toasts.odooSyncFailed", { detail: body.detail ?? t("toasts.unknownError") }),
          { duration: 8000 },
        );
      } else {
        // Mostrar el detalle real del servidor si está disponible, no un mensaje genérico.
        const reason = body.detail ?? body.error;
        toast.error(
          reason ? t("toasts.approveErrorWithReason", { reason }) : t("errors.approveFailed"),
          { duration: 8000 },
        );
      }
      return;
    }

    // Celebration milestone check
    try {
      const prev = parseInt(localStorage.getItem(APPROVED_COUNT_KEY) ?? "0", 10);
      const next = prev + 1;
      localStorage.setItem(APPROVED_COUNT_KEY, String(next));
      const milestone = celebrate(next);
      if (milestone) {
        setActiveMilestone(milestone);
        await new Promise((r) => setTimeout(r, 5200));
      }
    } catch {
      /* ignore localStorage errors */
    }

    setDuplicateInfo(null);
    router.replace("/processed");
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="default"
        disabled={loading}
        onClick={() => approve()}
        className="h-8 gap-1.5 rounded-md bg-emerald-500 px-3 text-[12px] font-semibold text-white shadow-sm shadow-emerald-500/30 transition-colors hover:bg-emerald-400 disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <CheckCircle2 size={13} aria-hidden="true" />
        )}
        {loading ? t("approving") : t("approve")}
      </Button>

      <Dialog open={duplicateInfo !== null} onOpenChange={(open) => !open && !forceLoading && setDuplicateInfo(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertTriangle size={16} />
              </div>
              <div>
                <DialogTitle className="text-[14px] font-semibold">
                  {t("forceDuplicate.title")}
                </DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
                  {duplicateInfo?.existingSo
                    ? t("forceDuplicate.subtitleWithSo", { so: duplicateInfo.existingSo })
                    : t("forceDuplicate.subtitle")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-3 text-[12px] text-foreground">
            <p>{t("forceDuplicate.description")}</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>{t("forceDuplicate.bullet1")}</li>
              <li>{t("forceDuplicate.bullet2")}</li>
              <li>{t("forceDuplicate.bullet3")}</li>
            </ul>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              disabled={forceLoading}
              onClick={() => setDuplicateInfo(null)}
            >
              {t("forceDuplicate.cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={forceLoading}
              onClick={() => approve({ force: true })}
            >
              {forceLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <AlertTriangle className="size-3.5" />
              )}
              {forceLoading ? t("forceDuplicate.forcing") : t("forceDuplicate.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeMilestone && (
        <CelebrationToast milestone={activeMilestone} onDismiss={() => setActiveMilestone(null)} />
      )}
    </>
  );
}
