"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Smartphone, Monitor, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateType: "order_approved" | "daily_digest";
  templateLabel: string;
  subject: string;
  intro: string;
}

type ViewportMode = "desktop" | "mobile";

export function EmailPreviewDialog({
  open,
  onOpenChange,
  templateType,
  templateLabel,
  subject,
  intro,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportMode>("desktop");

  // Fetch preview HTML when dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/settings/notifications/templates/${templateType}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, intro }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (!cancelled) {
          setHtml(text);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, templateType, subject, intro]);

  // Inject HTML into iframe via srcdoc.
  useEffect(() => {
    if (iframeRef.current && html) {
      iframeRef.current.srcdoc = html;
    }
  }, [html]);

  function openInNewTab() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // Liberar la URL después de un rato
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[920px] max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="border-b border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Eye size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[14px] font-semibold truncate">
                  Preview · {templateLabel}
                </DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  Vista previa con datos de ejemplo. Subject: <span className="font-medium text-foreground/80">{subject || "(default)"}</span>
                </DialogDescription>
              </div>
            </div>

            {/* Viewport toggle */}
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  viewport === "desktop"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Monitor size={11} />
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setViewport("mobile")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  viewport === "mobile"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Smartphone size={11} />
                Móvil
              </button>
            </div>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={openInNewTab}
              disabled={!html}
              className="h-7 gap-1.5 text-[11px]"
            >
              <ExternalLink size={11} />
              Abrir en pestaña
            </Button>
          </div>
        </DialogHeader>

        {/* Preview area */}
        <div className="flex-1 overflow-auto bg-muted/30 p-6 min-h-[400px]">
          {loading ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-2">
              <Loader2 className="size-5 animate-spin text-violet-500" />
              <p className="text-[12px] text-muted-foreground">Generando preview…</p>
            </div>
          ) : error ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-2 text-center">
              <p className="text-[13px] font-semibold text-red-600 dark:text-red-400">
                No se pudo generar el preview
              </p>
              <p className="text-[11px] text-muted-foreground max-w-md">{error}</p>
            </div>
          ) : (
            <div
              className={cn(
                "mx-auto bg-white rounded-lg overflow-hidden shadow-sm transition-all duration-300",
                viewport === "desktop" ? "w-full max-w-[720px]" : "w-[380px]",
              )}
            >
              <iframe
                ref={iframeRef}
                title="Email preview"
                className="block w-full"
                style={{ height: "70vh", minHeight: 500, border: 0 }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-muted/20 px-6 py-3 flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            Los datos mostrados son ficticios. Cuando se envíe el email real, se usarán los valores actuales.
          </p>
          <Button size="sm" variant="default" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
