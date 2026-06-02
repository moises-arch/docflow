"use client";

import { useEffect, useState } from "react";
import { X, Upload, ScanEye, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "intake:onboarding-dismissed";

interface OnboardingBannerProps {
  hasDocuments: boolean;
}

export function OnboardingBanner({ hasDocuments }: OnboardingBannerProps) {
  const t = useTranslations("onboarding");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasDocuments) return;
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) queueMicrotask(() => setVisible(true));
    } catch {
      // localStorage unavailable
    }
  }, [hasDocuments]);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (!visible) return null;

  const steps = [
    { icon: Upload, label: t("step1") },
    { icon: ScanEye, label: t("step2") },
    { icon: CheckCircle2, label: t("step3") },
  ];

  return (
    <div
      className={cn("border-b border-[var(--color-border)] bg-[var(--color-surface)]", "px-4 py-3")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-fg)]">{t("title")}</p>
          <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{t("subtitle")}</p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {steps.map(({ icon: Icon, label }, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2.5 py-1">
                  <Icon
                    size={12}
                    className="shrink-0 text-[var(--color-fg-mute)]"
                    aria-hidden="true"
                  />
                  <span className="text-xs text-[var(--color-fg)]">{label}</span>
                </div>
                {i < steps.length - 1 && (
                  <span className="text-xs text-[var(--color-fg-subtle)]" aria-hidden="true">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dismiss")}
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-fg-subtle)] transition-colors duration-[120ms] hover:bg-[var(--color-surface-mute)] hover:text-[var(--color-fg)]"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
