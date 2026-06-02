import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "ok" | "warn" | "error" | "info" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  error: "text-red-700 dark:text-red-400",
  info: "text-blue-700 dark:text-blue-400",
  neutral: "text-[var(--color-fg)]",
};

export function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
  className,
}: {
  icon?: ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-mute)]">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", TONE_CLASS[tone])}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-[var(--color-fg-mute)]">{hint}</div>}
    </div>
  );
}
