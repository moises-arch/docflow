"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import type { ReviewProfile } from "../../_lib/types";

export function BillingNormalizationToggle({ profile }: { profile: ReviewProfile }) {
  const t = useTranslations("templates.profileStudio.configuration.billingNormalization");
  const [enabled, setEnabled] = useState(profile.normalize_billing_from_odoo_partner);
  const [saving, setSaving] = useState(false);

  async function toggle(next: boolean) {
    setSaving(true);
    try {
      const res = await fetch(`/api/integrations/review-profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalize_billing_from_odoo_partner: next }),
      });
      if (!res.ok) throw new Error();
      setEnabled(next);
      toast.success(next ? t("enabledToast") : t("disabledToast"));
    } catch {
      toast.error(t("errorToast"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)]">
              <Receipt size={12} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--color-fg)]">{t("label")}</p>
              <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{t("description")}</p>
              {enabled && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  {t("activeHint")}
                </p>
              )}
            </div>
          </div>

          <Switch
            checked={enabled}
            disabled={saving}
            onCheckedChange={(next) => void toggle(next)}
            aria-label={t("ariaLabel")}
            className="data-checked:bg-emerald-500"
          />
        </div>
      </div>
    </section>
  );
}
