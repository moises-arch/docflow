import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, subtitle, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      {Icon && (
        <div className="mb-3 text-[var(--color-fg-subtle)]">
          <Icon size={32} strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-medium text-[var(--color-fg)]">{title}</p>
      {subtitle && <p className="mt-1 max-w-xs text-xs text-[var(--color-fg-mute)]">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
