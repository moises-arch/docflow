"use client";

import { Upload, ScanEye, CheckCircle2, ArrowRight, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SmartEmptyStateProps {
  onUpload?: () => void;
  className?: string;
}

export function SmartEmptyState({ onUpload, className }: SmartEmptyStateProps) {
  const t = useTranslations("help.smartEmptyState");
  const tInbox = useTranslations("inbox.empty");

  const STEPS = [
    { icon: Upload, title: t("step1Title"), description: t("step1Desc") },
    { icon: ScanEye, title: t("step2Title"), description: t("step2Desc") },
    { icon: CheckCircle2, title: t("step3Title"), description: t("step3Desc") },
    { icon: Zap, title: t("step4Title"), description: t("step4Desc") },
  ] as const;
  return (
    <div
      className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}
    >
      {/* Icon cluster */}
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface-mute)] text-[var(--color-fg-subtle)]">
        <Upload size={22} strokeWidth={1.5} aria-hidden="true" />
      </div>

      <h3 className="text-sm font-semibold text-[var(--color-fg)]">{tInbox("title")}</h3>
      <p className="mt-1 max-w-xs text-xs text-[var(--color-fg-mute)]">{t("title")}</p>

      {/* Step flow */}
      <div className="mt-8 flex flex-wrap items-start justify-center gap-2">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex items-start gap-2">
            <div className="flex max-w-[120px] flex-col items-center text-center">
              <div
                className={cn(
                  "mb-2 flex h-9 w-9 items-center justify-center rounded-md border",
                  "border-[var(--color-border)] bg-[var(--color-surface-mute)]",
                  "text-[var(--color-fg-mute)]",
                )}
              >
                <step.icon size={15} aria-hidden="true" />
              </div>
              <span className="text-[11px] font-semibold text-[var(--color-fg)]">{step.title}</span>
              <span className="mt-0.5 text-[10px] leading-snug text-[var(--color-fg-subtle)]">
                {step.description}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <ArrowRight
                size={14}
                className="mt-2.5 shrink-0 text-[var(--color-fg-subtle)]"
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>

      {onUpload && (
        <Button size="default" variant="default" onClick={onUpload} className="mt-8 gap-2">
          <Upload size={14} aria-hidden="true" />
          {tInbox("cta")}
        </Button>
      )}
    </div>
  );
}
