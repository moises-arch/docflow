"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, ImageIcon, Loader2, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FilePreviewModalProps {
  documentId: string | null;
  documentName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  pageCount?: number | null;
  onClose: () => void;
}

interface SignedUrlResult {
  url: string;
  mimeType: string;
  name: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePreviewModal({
  documentId,
  documentName,
  mimeType,
  sizeBytes,
  pageCount,
  onClose,
}: FilePreviewModalProps) {
  const [result, setResult] = useState<SignedUrlResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setResult(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    fetch(`/api/documents/${documentId}/download?view=1`)
      .then((r) => {
        if (!r.ok) throw new Error("Could not load file");
        return r.json() as Promise<SignedUrlResult>;
      })
      .then(setResult)
      .catch(() => setError("The file could not be loaded. It may have been deleted or the session expired."))
      .finally(() => setLoading(false));
  }, [documentId]);

  const resolvedMime = result?.mimeType ?? mimeType ?? "";
  const isPdf = resolvedMime === "application/pdf" || documentName.toLowerCase().endsWith(".pdf");
  const isImage = resolvedMime.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(documentName);

  const FileIcon = isImage ? ImageIcon : FileText;

  const meta: string[] = [];
  if (sizeBytes) meta.push(formatBytes(sizeBytes));
  if (pageCount) meta.push(`${pageCount} ${pageCount === 1 ? "page" : "pages"}`);

  return (
    <Dialog open={!!documentId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
              <FileIcon size={15} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-semibold leading-tight">
                {documentName}
              </DialogTitle>
              {meta.length > 0 && (
                <p className="text-[11px] text-muted-foreground">{meta.join(" · ")}</p>
              )}
            </div>
          </div>
          {result?.url && (
            <a
              href={`/api/documents/${documentId}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <Button size="sm" variant="outline" className="gap-1.5">
                <Download size={13} />
                Download
              </Button>
            </a>
          )}
        </DialogHeader>

        {/* Preview area */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/40">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 size={24} className="animate-spin" />
              <span className="text-sm">Loading file…</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2 px-6 text-center text-muted-foreground">
              <AlertCircle size={24} className="text-destructive" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {result?.url && (
            <>
              {(isPdf || (!isImage && !isPdf)) && (
                <iframe
                  src={result.url}
                  title={documentName}
                  className="h-[calc(90vh-80px)] w-full border-0"
                />
              )}
              {isImage && !isPdf && (
                <div className="flex max-h-[calc(90vh-80px)] w-full items-center justify-center overflow-auto p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.url}
                    alt={documentName}
                    className="max-h-full max-w-full rounded object-contain shadow"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
