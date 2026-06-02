"use client";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, FileJson, WandSparkles, X } from "lucide-react";

export type ReviewView = "original" | "json" | "studio";

interface ViewModeRailProps {
  value: ReviewView;
  onChange: (view: ReviewView) => void;
}

const MODES = [
  { id: "original" as const, label: "Original", icon: Eye },
  { id: "json" as const, label: "JSON", icon: FileJson },
  { id: "studio" as const, label: "Studio", icon: WandSparkles },
];

export function ViewModeRail({ value, onChange }: ViewModeRailProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "absolute top-3 right-3 z-20 flex flex-col gap-0.5 rounded-md border border-border bg-background/85 p-1 shadow-md backdrop-blur-sm",
        )}
      >
        {MODES.map(({ id, label, icon: Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange(id)}
                className={cn(
                  "flex size-7 items-center justify-center rounded transition-all duration-100",
                  value === id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                aria-label={label}
              >
                <Icon size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={6}>
              <span className="text-xs">{label}</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

interface FloatingPanelProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function FloatingPanel({ title, onClose, children }: FloatingPanelProps) {
  return (
    <div className="absolute inset-y-0 right-12 z-10 flex w-[min(640px,calc(100%-3.5rem))] flex-col border-l border-border bg-background/97 shadow-xl backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-[12px] font-semibold text-foreground">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Cerrar panel"
        >
          <X size={13} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
