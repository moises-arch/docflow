"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

type BannerKind = "info" | "warning" | "error" | "success";

const kindStyles: Record<BannerKind, string> = {
  info: "border-[color:var(--color-blue)]/20 bg-[color:var(--color-blue)]/5 text-[color:var(--color-blue)]",
  warning:
    "border-[color:var(--color-amber)]/20 bg-[color:var(--color-amber)]/5 text-[color:var(--color-amber)]",
  error:
    "border-[color:var(--color-rose)]/20 bg-[color:var(--color-rose)]/5 text-[color:var(--color-rose)]",
  success:
    "border-[color:var(--color-teal)]/20 bg-[color:var(--color-teal)]/5 text-[color:var(--color-teal)]",
};

interface BannerProps {
  kind?: BannerKind;
  message: string;
  dismissible?: boolean;
  className?: string;
}

export function Banner({ kind = "info", message, dismissible = true, className }: BannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-2.5",
        "text-sm",
        kindStyles[kind],
        className,
      )}
    >
      <span className="flex-1">{message}</span>
      {dismissible && (
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto shrink-0 rounded-[var(--radius-sm)] p-0.5 opacity-70 transition-opacity hover:opacity-100"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
