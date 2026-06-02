"use client";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface PushButtonProps {
  draftId: string;
  beforeApprove?: () => Promise<boolean>;
}

type PushError = {
  error?: string;
  detail?: string;
  existing_odoo_so_name?: string | null;
};

export function PushButton({ draftId, beforeApprove }: PushButtonProps) {
  const t = useTranslations("review");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    detail: string;
    existingSo: string | null;
  } | null>(null);
  const [forceLoading, setForceLoading] = useState(false);

  async function push(opts?: { force?: boolean }) {
    const force = opts?.force === true;
    if (force) setForceLoading(true);
    else setLoading(true);

    if (!force && beforeApprove) {
      const saved = await beforeApprove();
      if (!saved) {
        setLoading(false);
        return;
      }
    }

    const response = await fetch(`/api/order-drafts/${draftId}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force_duplicate_po: force }),
    });

    const body = (await response.json().catch(() => ({}))) as PushError & {
      sync_state?: string;
      odoo_so_name?: string | null;
    };

    setLoading(false);
    setForceLoading(false);

    if (!response.ok) {
      if (response.status === 409 && body.error === "duplicate_po_number") {
        setDuplicateInfo({
          detail: body.detail ?? "",
          existingSo: body.existing_odoo_so_name ?? null,
        });
        return;
      }
      if (body.error === "odoo_connection_inactive") {
        toast.error(body.detail ?? "Conexión ERP inactiva");
        return;
      }
      if (body.error === "no_lines") {
        toast.error("El draft no tiene líneas — no se puede pushear");
        return;
      }
      toast.error(body.detail ?? body.error ?? "Push falló");
      return;
    }

    if (body.sync_state === "sync_failed") {
      toast.warning(
        `Pusheado con error: ${body.detail ?? "ver log"}. Verifica en ERP.`,
        { duration: 10000 },
      );
    } else {
      toast.success(
        body.odoo_so_name
          ? `Push enviado → ERP: ${body.odoo_so_name}`
          : "Push enviado a ERP (verifica en ERP).",
      );
    }

    setDuplicateInfo(null);
    setConfirmOpen(false);
    router.replace("/processed");
    router.refresh();
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={loading}
            onClick={() => setConfirmOpen(true)}
            aria-label="Push a ERP (bypass)"
            className="h-8 gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 text-[12px] font-semibold text-amber-300 transition-colors hover:bg-amber-400/20 hover:text-amber-200 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Zap size={13} aria-hidden="true" fill="currentColor" />
            )}
            <span className="hidden md:inline">Bypass</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Push a ERP (bypass validaciones)</TooltipContent>
      </Tooltip>

      {/* Confirm bypass push */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Push a ERP sin validaciones</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                Esto va a crear el sales order en ERP aunque haya campos sin resolver
                (buyer, provider, campos requeridos). Verificá en ERP después.
              </span>
              <span className="block text-xs text-muted-foreground">
                Sí se valida: conexión ERP activa, ≥1 línea y PO no duplicado.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => push()}>Push a ERP</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate PO confirm */}
      <AlertDialog
        open={duplicateInfo !== null}
        onOpenChange={(open) => !open && !forceLoading && setDuplicateInfo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("forceDuplicate.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateInfo?.existingSo
                ? t("forceDuplicate.subtitleWithSo", { so: duplicateInfo.existingSo })
                : t("forceDuplicate.subtitle")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={forceLoading}>
              {t("forceDuplicate.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={forceLoading}
              onClick={() => push({ force: true })}
            >
              {forceLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {forceLoading ? t("forceDuplicate.forcing") : t("forceDuplicate.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
