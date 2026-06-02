"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface ZoomPopoverProps {
  zoom: number;
  zoomMode: "fit" | "manual";
  onZoomChange: (zoom: number) => void;
  onZoomModeChange: (mode: "fit" | "manual") => void;
}

function formatZoom(zoom: number) {
  return `${Math.round(zoom * 100)}%`;
}

interface ZoomPopoverProps { zoom: number; zoomMode: "fit" | "manual"; onZoomChange: (zoom: number) => void; onZoomModeChange: (mode: "fit" | "manual") => void; dark?: boolean; }

export function ZoomPopover({ zoom, zoomMode, onZoomChange, onZoomModeChange, dark }: ZoomPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 min-w-[52px] items-center justify-center rounded-md px-2 text-[12px] font-semibold tabular-nums transition-all",
            dark
              ? "border border-white/20 bg-white/10 text-white hover:bg-white/20"
              : "border border-border bg-background hover:bg-accent text-foreground",
          )}
          aria-label="Cambiar zoom"
        >
          {zoomMode === "fit" ? "Ajustar" : formatZoom(zoom)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={6} className="w-52 p-3">
        {/* Slider */}
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Zoom</span>
            <span className="text-[11px] font-semibold tabular-nums text-foreground">
              {formatZoom(zoom)}
            </span>
          </div>
          <Slider
            value={[Math.round(zoom * 100)]}
            min={25}
            max={250}
            step={5}
            onValueChange={([val]) => {
              if (val === undefined) return;
              onZoomModeChange("manual");
              onZoomChange(val / 100);
            }}
            className="w-full"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/60">
            <span>25%</span>
            <span>250%</span>
          </div>
        </div>

        {/* Divider */}
        <div className="mb-2 border-t border-border" />

        {/* Presets */}
        <div className="grid grid-cols-3 gap-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onZoomModeChange("manual");
                onZoomChange(p);
              }}
              className={cn(
                "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                zoomMode === "manual" && Math.round(zoom * 100) === Math.round(p * 100)
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-foreground",
              )}
            >
              {Math.round(p * 100)}%
            </button>
          ))}
        </div>

        {/* Fit */}
        <button
          type="button"
          onClick={() => onZoomModeChange("fit")}
          className={cn(
            "mt-1.5 w-full rounded px-2 py-1 text-[11px] font-medium transition-colors",
            zoomMode === "fit"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-accent text-foreground",
          )}
        >
          Ajustar a página
        </button>
      </PopoverContent>
    </Popover>
  );
}
