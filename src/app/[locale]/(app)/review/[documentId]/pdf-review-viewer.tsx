"use client";

import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type HighlightRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfOverlayHighlight = {
  id: string;
  label: string;
  value?: string;
  page: number;
  tone?: "blue" | "teal" | "amber" | "rose";
  searchTerms?: string[];
  rect?: HighlightRect;
  rects?: HighlightRect[];
  provenance?: "document_ai" | "pdf_text" | "anchor" | "manual";
};

export interface PdfReviewViewerProps {
  url: string;
  fileName: string;
  mimeType: string | null;
  pageCount: number | null;
  labels: {
    loading: string;
    page: string;
    of: string;
    thumbnails: string;
    clearSelection: string;
  };
  highlights?: PdfOverlayHighlight[];
  selectedHighlightId?: string | null;
  onSelectHighlight?: (id: string | null) => void;
  currentPage: number;
  onCurrentPageChange: (page: number) => void;
  totalPages: number;
  onTotalPagesChange: (count: number) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  zoomMode: "fit" | "manual";
  onZoomModeChange?: (mode: "fit" | "manual") => void;
  pageFlow: "vertical" | "horizontal";
  thumbnailsOpen?: boolean;
  rotation?: number;
}

type PageState = {
  pageNumber: number;
  page: PDFPageProxy;
  width: number;
  height: number;
};

function clampZoom(value: number) {
  return Math.min(2.5, Math.max(0.5, value));
}

// Highlight-related helpers removed — overlays are no longer rendered on PDF pages


function PdfPageLayer({
  page,
  scale,
  rotation,
}: {
  page: PageState;
  scale: number;
  rotation?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  // Respect the PDF's intrinsic page rotation (set by the PDF author / printer driver).
  // pdf.js returns 0 / 90 / 180 / 270 in `page.rotate`. Passing `rotation: 0` to
  // getViewport would OVERRIDE that and show the page at canonical 0° — which
  // breaks documents that were saved rotated (e.g. landscape POs). Combining
  // intrinsic + user rotation preserves author intent and lets the user adjust
  // on top.
  const intrinsicRotation = (page.page.rotate ?? 0) as number;
  const effectiveRotation = ((intrinsicRotation + (rotation ?? 0)) % 360 + 360) % 360;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const viewport = page.page.getViewport({ scale, rotation: effectiveRotation });
    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);

    const renderTask = page.page.render({ canvas, canvasContext: context, viewport });
    renderTask.promise.catch(() => undefined);

    // Render text layer on top of canvas so users can select & copy text.
    // The layer contains transparent <span>s positioned to match the rendered
    // glyphs — selection works exactly like a native PDF viewer.
    const textLayerDiv = textLayerRef.current;
    let textLayerInstance: TextLayer | null = null;
    if (textLayerDiv) {
      // Wipe previous render before drawing a new one (zoom / rotation change)
      textLayerDiv.replaceChildren();
      textLayerDiv.style.setProperty("--scale-factor", String(viewport.scale));

      const textContentSource = page.page.streamTextContent({
        includeMarkedContent: true,
        disableNormalization: true,
      });
      textLayerInstance = new TextLayer({
        textContentSource,
        container: textLayerDiv,
        viewport,
      });
      textLayerInstance.render().catch(() => undefined);
    }

    return () => {
      renderTask.cancel();
      textLayerInstance?.cancel();
    };
  }, [page.page, scale, effectiveRotation]);

  const containerWidth = page.page.getViewport({ scale, rotation: effectiveRotation }).width + 24;

  return (
    <div
      className="relative rounded-lg border border-slate-200/60 bg-white p-3 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.08),0_24px_60px_-8px_rgba(15,23,42,0.22),0_0_0_1px_rgba(0,0,0,0.03)]"
      style={{ width: `${containerWidth}px` }}
    >
      <div className="relative">
        <canvas ref={canvasRef} className="block rounded-sm bg-white" />
        <div
          ref={textLayerRef}
          className="textLayer absolute left-0 top-0"
          aria-hidden="false"
        />
      </div>
      <div className="pointer-events-none absolute inset-3 rounded-sm ring-1 ring-slate-200/60 ring-inset" />
      {/* highlight overlays removed — keeping PDF clean */}
    </div>
  );
}

function useResizeWidth(containerRef: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => setWidth(container.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  return width;
}

export function PdfReviewViewer({
  url,
  fileName,
  mimeType,
  labels,
  highlights = [],
  selectedHighlightId = null,
  onSelectHighlight,
  currentPage,
  onCurrentPageChange,
  totalPages,
  onTotalPagesChange,
  zoom,
  onZoomChange,
  zoomMode,
  onZoomModeChange,
  pageFlow,
  thumbnailsOpen,
  rotation,
}: PdfReviewViewerProps) {
  const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const [pages, setPages] = useState<PageState[]>([]);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(isPdf ? null : url);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  // highlights removed — keeping refs as no-op for backwards compat with consumers
  void highlights; void selectedHighlightId; void onSelectHighlight;
  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Tracks the last page reported by IntersectionObserver (user scrolling).
  // Prevents scrollToPage from firing when the page change originated from the observer.
  const observedPageRef = useRef(0);
  const stageWidth = useResizeWidth(stageRef);
  // Keep a ref to zoom so the wheel handler always sees the current value without stale closure
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Ctrl+scroll → zoom (non-passive so we can preventDefault)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const step = e.deltaY > 0 ? -0.1 : 0.1;
      onZoomModeChange?.("manual");
      onZoomChange(clampZoom(zoomRef.current + step));
    };
    container.addEventListener("wheel", handler, { passive: false });
    return () => container.removeEventListener("wheel", handler);
  }, [onZoomChange, onZoomModeChange]);

  // Drag-to-pan handlers (middle-click or space+drag without needing space key in viewer)
  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      // Middle-click pan
      if (e.button === 1) {
        e.preventDefault();
        dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y };
        setIsDragging(true);
      }
    },
    [pan],
  );

  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    setPan({
      x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.mouseX),
      y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.mouseY),
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragStartRef.current = null;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isPdf) {
      return;
    }

    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;

    const task = getDocument({ url, useWorkerFetch: true, withCredentials: false });

    task.promise
      .then(async (documentProxy) => {
        if (cancelled) return;
        loadedDocument = documentProxy;
        onTotalPagesChange(documentProxy.numPages);
        const loadedPages = await Promise.all(
          Array.from({ length: documentProxy.numPages }, async (_, index) => {
            const page = await documentProxy.getPage(index + 1);
            const viewport = page.getViewport({ scale: 1 });
            return {
              pageNumber: page.pageNumber,
              page,
              width: viewport.width,
              height: viewport.height,
            } satisfies PageState;
          }),
        );
        if (cancelled) return;
        setPages(loadedPages);
        setLoadError(null);
        setResolvedUrl(url);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "pdf_load_failed");
        setResolvedUrl(url);
      });

    return () => {
      cancelled = true;
      task.destroy();
      loadedDocument?.destroy();
    };
  }, [isPdf, onTotalPagesChange, url]);

  useEffect(() => {
    if (!isPdf && currentPage !== 1) {
      onCurrentPageChange(1);
    }
  }, [currentPage, isPdf, onCurrentPageChange]);

  useEffect(() => {
    if (!isPdf && totalPages !== 1) {
      onTotalPagesChange(1);
    }
  }, [isPdf, onTotalPagesChange, totalPages]);

  const loading = isPdf && resolvedUrl !== url && !loadError;

  const fitScale = useMemo(() => {
    const sourceWidth = isPdf ? (pages[0]?.width ?? 0) : imageNaturalSize.width;
    if (!sourceWidth || !stageWidth) return 1;
    const gutter = thumbnailsOpen ? 240 : 120;
    const availableWidth = Math.max(stageWidth - gutter, stageWidth * 0.65);
    const scale = (availableWidth * 0.84) / sourceWidth;
    return Math.min(1.12, clampZoom(scale));
  }, [imageNaturalSize.width, isPdf, pages, stageWidth, thumbnailsOpen]);

  const effectiveScale = zoomMode === "fit" ? fitScale : zoom;

  useEffect(() => {
    if (zoomMode === "fit") {
      onZoomChange(fitScale);
    }
  }, [fitScale, onZoomChange, zoomMode]);

  // highlights logic removed — overlays are no longer rendered

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const pageElement = pageRefs.current.get(pageNumber);
      const container = scrollRef.current;
      if (!pageElement || !container) return;
      pageElement.scrollIntoView({
        behavior: "smooth",
        block: pageFlow === "vertical" ? "start" : "nearest",
        inline: pageFlow === "horizontal" ? "center" : "nearest",
      });
    },
    [pageFlow],
  );

  useEffect(() => {
    if (!isPdf) return;
    const target = Math.min(Math.max(currentPage, 1), Math.max(totalPages, 1));
    // Only scroll programmatically when the page change came from outside
    // (prev/next buttons, thumbnail click, pager). Skip if it was the observer reporting
    // what the user already scrolled to — avoids the snap-back loop.
    if (target === observedPageRef.current) return;
    scrollToPage(target);
  }, [currentPage, isPdf, scrollToPage, totalPages]);

  // highlight-driven scroll removed

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !isPdf || pages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const pageNumber = Number(visible?.target.getAttribute("data-page-number") ?? 0);
        if (pageNumber) {
          observedPageRef.current = pageNumber;
          onCurrentPageChange(pageNumber);
        }
      },
      {
        root: container,
        threshold: [0.25, 0.5, 0.75],
      },
    );

    for (const page of pageRefs.current.values()) {
      observer.observe(page);
    }

    return () => observer.disconnect();
  }, [isPdf, onCurrentPageChange, pages.length, pageFlow]);

  return (
    <TooltipProvider>
      <div
        className="relative h-full min-h-0 min-w-0 overflow-hidden"
        style={{ cursor: isDragging ? "grabbing" : undefined }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          ref={scrollRef}
          className={cn(
            "h-full min-h-0 overflow-auto transition-colors duration-300",
            "bg-slate-100 text-slate-900 dark:bg-slate-200 dark:text-slate-900",
            "bg-[radial-gradient(circle_at_1px_1px,rgba(71,85,105,0.22)_1px,transparent_0)]",
            "bg-[size:20px_20px]",
            isDragging && "pointer-events-none",
          )}
          onMouseDown={handleMouseDown}
        >
          <div
            ref={stageRef}
            className={cn(
              "relative min-h-full px-12 pt-12 pb-32",
              pageFlow === "horizontal" ? "overflow-x-auto" : "",
            )}
            style={{
              transform:
                pan.x !== 0 || pan.y !== 0 ? `translate(${pan.x}px, ${pan.y}px)` : undefined,
              transition: isDragging ? "none" : "transform 0.1s ease-out",
            }}
          >

            {loading ? (
              <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500 dark:text-slate-600">
                {labels.loading}
              </div>
            ) : loadError ? (
              <div className="flex min-h-[60vh] items-center justify-center px-6 text-center text-sm text-rose-600">
                {loadError}
              </div>
            ) : isPdf ? (
              <div
                className={cn(
                  "mx-auto flex min-h-full w-max gap-16",
                  pageFlow === "horizontal" ? "items-start" : "flex-col items-center",
                )}
              >
                {pages.map((page) => (
                  <div
                    key={page.pageNumber}
                    ref={(node) => {
                      if (node) pageRefs.current.set(page.pageNumber, node);
                      else pageRefs.current.delete(page.pageNumber);
                    }}
                    data-page-number={page.pageNumber}
                    className="shrink-0"
                  >
                    <PdfPageLayer
                      page={page}
                      scale={effectiveScale}
                      rotation={rotation}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mx-auto flex min-h-full w-full items-start justify-center">
                <div
                  className="relative rounded-md border border-slate-300/70 bg-[#fffef8] p-3 shadow-[0_20px_50px_rgba(15,23,42,0.14),0_6px_16px_rgba(15,23,42,0.08)]"
                  style={{
                    width: imageNaturalSize.width
                      ? `${Math.max(320, imageNaturalSize.width * effectiveScale)}px`
                      : undefined,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={fileName}
                    className="block h-auto w-full rounded-sm bg-white"
                    onLoad={(event) => {
                      const target = event.currentTarget;
                      setImageNaturalSize({
                        width: target.naturalWidth,
                        height: target.naturalHeight,
                      });
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
