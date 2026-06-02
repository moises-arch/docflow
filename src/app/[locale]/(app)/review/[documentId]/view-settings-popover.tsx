"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { LayoutTemplate, Maximize2, Rows3, RotateCw, Settings2, Columns3 } from "lucide-react";

interface ViewSettingsPopoverProps {
  pageFlow: "vertical" | "horizontal";
  onPageFlowChange: (flow: "vertical" | "horizontal") => void;
  rotation: 0 | 90 | 180 | 270;
  onRotationChange: (r: 0 | 90 | 180 | 270) => void;
  onFitPage: () => void;
  pagesRailOpen: boolean;
  onPagesRailToggle: () => void;
  pageCount: number | null;
  dark?: boolean;
}

export function ViewSettingsPopover({
  pageFlow,
  onPageFlowChange,
  rotation,
  onRotationChange,
  onFitPage,
  pagesRailOpen,
  onPagesRailToggle,
  pageCount,
  dark,
}: ViewSettingsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md transition-all",
            dark
              ? "text-white/70 hover:bg-white/10 hover:text-white"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          aria-label="Opciones de vista"
        >
          <Settings2 size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-52 p-2">
        {/* Flujo de páginas */}
        <div className="mb-1.5">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Disposición
          </p>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => onPageFlowChange("vertical")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium transition-colors",
                pageFlow === "vertical"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-foreground",
              )}
            >
              <Rows3 size={12} />
              Vertical
            </button>
            <button
              type="button"
              onClick={() => onPageFlowChange("horizontal")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium transition-colors",
                pageFlow === "horizontal"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-foreground",
              )}
            >
              <Columns3 size={12} />
              Horizontal
            </button>
          </div>
        </div>

        <div className="my-1.5 border-t border-border" />

        {/* Rotar */}
        <div className="mb-1.5">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Rotación{rotation !== 0 ? ` (${rotation}°)` : ""}
          </p>
          <button
            type="button"
            onClick={() =>
              onRotationChange((((rotation + 90) % 360) as 0 | 90 | 180 | 270))
            }
            className={cn(
              "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium transition-colors",
              rotation !== 0
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "hover:bg-accent text-foreground",
            )}
          >
            <RotateCw size={12} />
            Rotar 90°
          </button>
        </div>

        <div className="my-1.5 border-t border-border" />

        {/* Ajustar + miniaturas */}
        <button
          type="button"
          onClick={onFitPage}
          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium hover:bg-accent text-foreground transition-colors"
        >
          <Maximize2 size={12} />
          Ajustar a página
        </button>

        {(pageCount ?? 1) > 1 && (
          <button
            type="button"
            onClick={onPagesRailToggle}
            className={cn(
              "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium transition-colors",
              pagesRailOpen
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "hover:bg-accent text-foreground",
            )}
          >
            <LayoutTemplate size={12} />
            {pagesRailOpen ? "Ocultar páginas" : "Mostrar páginas"}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
