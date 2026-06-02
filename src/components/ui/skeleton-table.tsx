import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SkeletonTableProps {
  rows?: number;
  /** Approximate width fractions per column (must sum to ~1) */
  colWidths?: string[];
}

export function SkeletonTable({ rows = 8, colWidths }: SkeletonTableProps) {
  const widths = colWidths ?? ["w-20", "w-48", "w-16", "w-10", "w-10", "w-16"];
  return (
    <div className="w-full" aria-busy="true" aria-label="Loading documents">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-2.5"
        >
          {widths.map((w, j) => (
            <Skeleton key={j} className={cn("h-4", w)} />
          ))}
        </div>
      ))}
    </div>
  );
}
