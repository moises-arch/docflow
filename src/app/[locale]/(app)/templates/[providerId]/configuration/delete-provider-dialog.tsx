"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export function DeleteProviderDialog({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName: string;
}) {
  const t = useTranslations("settings.providers.deleteProvider");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const nameMatches = confirmText.trim() === providerName;
  const canDelete = acknowledged && nameMatches && !deleting;

  function reset() {
    setAcknowledged(false);
    setConfirmText("");
    setDeleting(false);
  }

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/settings/providers/${providerId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(t("errorToast"));
        setDeleting(false);
        return;
      }
      toast.success(t("successToast", { name: providerName }));
      setOpen(false);
      reset();
      router.push("/templates");
    } catch {
      toast.error(t("errorToast"));
      setDeleting(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[color:var(--color-rose)]/30 bg-[color:var(--color-rose)]/5 px-3 text-xs font-medium text-[color:var(--color-rose)] transition-colors hover:bg-[color:var(--color-rose)]/10"
        >
          <Trash2 size={12} aria-hidden="true" />
          {t("trigger")}
        </button>
      </AlertDialogTrigger>

      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[color:var(--color-rose)]/10 text-[color:var(--color-rose)]">
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <AlertDialogTitle>{t("dialogTitle")}</AlertDialogTitle>
              <AlertDialogDescription className="mt-1.5">
                {t("intro", { name: providerName })}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="grid gap-3 py-2">
          <div className="rounded-[var(--radius-sm)] border border-[color:var(--color-rose)]/20 bg-[color:var(--color-rose)]/5 p-3">
            <p className="text-xs font-semibold tracking-wide text-[color:var(--color-rose)] uppercase">
              {t("consequencesTitle")}
            </p>
            <ul className="mt-2 grid gap-1.5 text-sm text-[var(--color-fg)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[color:var(--color-rose)]" />
                {t("consequence1")}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[color:var(--color-rose)]" />
                {t("consequence2")}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[color:var(--color-rose)]" />
                {t("consequence3")}
              </li>
            </ul>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--color-fg)]">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
              className="mt-0.5"
            />
            <span>{t("confirmCheckbox")}</span>
          </label>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-[var(--color-fg-mute)]">
              {t("typeToConfirmLabel")}
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t("typeToConfirmPlaceholder", { name: providerName })}
              className={cn(
                "h-9 w-full rounded-[var(--radius-sm)] border bg-[var(--color-bg)] px-2.5 font-mono text-sm outline-none transition-colors",
                confirmText.length > 0 && !nameMatches
                  ? "border-[color:var(--color-rose)] focus:border-[color:var(--color-rose)]"
                  : "border-[var(--color-border)] focus:border-[var(--color-fg)]",
              )}
              autoComplete="off"
              spellCheck={false}
            />
            {confirmText.length > 0 && !nameMatches && (
              <p className="text-[11px] text-[color:var(--color-rose)]">{t("typeMismatch")}</p>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canDelete}
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
            className={cn(
              "bg-[color:var(--color-rose)] text-white hover:bg-[color-mix(in_oklab,var(--color-rose)_85%,black)]",
              !canDelete && "opacity-50",
            )}
          >
            {deleting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Trash2 size={13} aria-hidden="true" />
            )}
            {deleting ? t("deleting") : t("confirmDelete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
