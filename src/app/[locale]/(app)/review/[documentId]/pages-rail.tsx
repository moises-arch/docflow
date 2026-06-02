"use client";

import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type PageEntry = { pageNumber: number; page: PDFPageProxy };

// Width available inside the rail for each thumbnail (rail 100px - 12px padding)
const THUMB_WIDTH = 82;

function ThumbnailCanvas({
  page,
  selected,
  onClick,
}: {
  page: PDFPageProxy;
  selected: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Scale to fit THUMB_WIDTH exactly, preserving aspect ratio
    const naturalViewport = page.getViewport({ scale: 1 });
    const scale = THUMB_WIDTH / naturalViewport.width;
    const viewport = page.getViewport({ scale });

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);

    const task = page.render({ canvas, canvasContext: ctx, viewport });
    task.promise.catch(() => undefined);
    return () => task.cancel();
  }, [page]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full rounded-[2px] border text-left transition-all duration-100",
        selected
          ? "border-primary/60 bg-white shadow-sm ring-1 ring-primary/40"
          : "border-border bg-white/80 hover:border-primary/30 hover:bg-white",
      )}
    >
      <canvas ref={canvasRef} className="block w-full rounded-none bg-white" />
      <div
        className={cn(
          "mt-1 px-0.5 text-center text-[9px] tabular-nums",
          selected ? "font-semibold text-primary" : "text-muted-foreground",
        )}
      >
        {page.pageNumber}
      </div>
    </button>
  );
}

interface PagesRailProps {
  url: string;
  pageCount: number | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PagesRail({
  url,
  pageCount,
  currentPage,
  onPageChange,
  open,
  onOpenChange,
}: PagesRailProps) {
  const [pages, setPages] = useState<PageEntry[]>([]);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const pdf = await getDocument({ url }).promise;
      pdfRef.current = pdf;
      const entries: PageEntry[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i);
        entries.push({ pageNumber: i, page: p });
      }
      setPages(entries);
    } catch {
      // ignore
    }
  }, [url]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      pdfRef.current?.destroy().catch(() => undefined);
    };
  }, [load]);

  // Don't render if only 1 page
  if ((pageCount ?? 1) <= 1) return null;

  return (
    <div
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r border-border bg-card transition-all duration-200 ease-out",
        open ? "w-[100px]" : "w-0 overflow-hidden",
      )}
    >
      {/* Edge handle to reopen (visible when collapsed, 6px wide) */}
      {!open && (
        <button
          type="button"
          aria-label="Abrir páginas"
          onClick={() => onOpenChange(true)}
          className="absolute inset-y-0 right-0 w-1.5 cursor-e-resize bg-transparent hover:bg-primary/10 transition-colors"
        />
      )}

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          Págs
        </span>
        <button
          type="button"
          aria-label="Cerrar páginas"
          onClick={() => onOpenChange(false)}
          className="rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M7.5 2.5L2.5 7.5M2.5 2.5L7.5 7.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Thumbnails */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <div className="grid gap-1.5">
          {pages.map((entry) => (
            <ThumbnailCanvas
              key={entry.pageNumber}
              page={entry.page}
              selected={entry.pageNumber === currentPage}
              onClick={() => {
                onPageChange(entry.pageNumber);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
