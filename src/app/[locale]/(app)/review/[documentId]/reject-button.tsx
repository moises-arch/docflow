"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, XCircle } from "lucide-react";

interface RejectButtonProps {
  draftId: string;
}

export function RejectButton({ draftId }: RejectButtonProps) {
  const t = useTranslations("review");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function reject() {
    setLoading(true);
    const response = await fetch(`/api/order-drafts/${draftId}/reject`, { method: "POST" });

    if (!response.ok) {
      setLoading(false);
      toast.error(t("errors.rejectFailed"));
      return;
    }

    router.replace("/processed");
    router.refresh();
  }

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          className="h-8 gap-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-2.5 text-[12px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle size={13} />}
          {loading ? t("rejecting") : t("reject")}
        </Button>
      </AlertDialog.Trigger>

      <AlertDialog.Portal>
        <AlertDialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <AlertDialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-sm",
            "rounded-[var(--radius-md)] border border-[var(--color-border)]",
            "bg-[var(--color-surface)] p-5",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <AlertDialog.Title className="text-base font-medium text-[var(--color-fg)]">
            {t("rejectConfirm")}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 text-sm text-[var(--color-fg-mute)]">
            {t("rejectConfirmDescription")}
          </AlertDialog.Description>

          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button type="button" size="sm" variant="secondary">
                {tCommon("cancel")}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={loading}
                onClick={reject}
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                {t("reject")}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
