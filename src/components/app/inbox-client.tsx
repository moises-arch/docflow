"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { UploadDropzone } from "@/components/app/upload-dropzone";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createClient } from "@/lib/supabase/browser";
import { useTranslations, useLocale } from "next-intl";
import {
  AlertTriangle,
  AlertTriangleIcon,
  ArrowRight,
  Loader2,
  Mail,
  RotateCcw,
  SearchIcon,
  Trash2,
  Upload,
  XIcon,
} from "lucide-react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { OnboardingBanner } from "@/components/app/onboarding-banner";
import { EmailViewerDrawer } from "@/components/app/email-viewer-drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/reui/badge";
import { DataGrid } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import {
  DataGridTable,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table";
import {
  ColumnDef,
  ColumnPinningState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  Row,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useRouter } from "@/i18n/navigation";
import { formatRelativeTime, formatFullTimestamp } from "@/lib/time";
import { FilePreviewModal } from "@/components/app/file-preview-modal";

export interface DocumentRow {
  id: string;
  doc_number?: string | null;
  original_name: string;
  state: string;
  page_count: number | null;
  created_at: string;
  updated_at?: string | null;
  credit_cost?: number | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  source_channel?: "upload" | "email" | "api" | "browser" | null;
  meta?: {
    parent_document_id?: string;
    split_index?: number;
    split_total?: number;
    split_count?: number;
    split_identifier?: string | null;
    split_document_type?: string;
  } | null;
  source_meta?: {
    inbound_email_id?: string;
    adapter?: string;
    message_id?: string;
    from_email?: string;
    source?: string;
    [key: string]: unknown;
  } | null;
  last_error?: string | null;
  _optimistic?: boolean;
  _progress?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── File type icon ─────────────────────────────────────────────────────────────
const FILE_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pdf:  { bg: "bg-red-100 dark:bg-red-900/30",    text: "text-red-600 dark:text-red-400",    label: "PDF"  },
  jpg:  { bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-600 dark:text-blue-400",   label: "JPG"  },
  jpeg: { bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-600 dark:text-blue-400",   label: "JPG"  },
  png:  { bg: "bg-teal-100 dark:bg-teal-900/30",   text: "text-teal-600 dark:text-teal-400",   label: "PNG"  },
  webp: { bg: "bg-purple-100 dark:bg-purple-900/30",text: "text-purple-600 dark:text-purple-400",label: "WEBP" },
  gif:  { bg: "bg-pink-100 dark:bg-pink-900/30",   text: "text-pink-600 dark:text-pink-400",   label: "GIF"  },
  html: { bg: "bg-orange-100 dark:bg-orange-900/30",text: "text-orange-600 dark:text-orange-400",label: "HTML" },
  docx: { bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-700 dark:text-blue-400",   label: "DOC"  },
  doc:  { bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-700 dark:text-blue-400",   label: "DOC"  },
  xlsx: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "XLS"  },
  xls:  { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "XLS"  },
  csv:  { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400", label: "CSV"  },
  txt:  { bg: "bg-gray-100 dark:bg-gray-800",       text: "text-gray-600 dark:text-gray-400",   label: "TXT"  },
  xml:  { bg: "bg-orange-100 dark:bg-orange-900/30",text: "text-orange-600 dark:text-orange-400",label: "XML" },
};

function FileTypeIcon({ filename, size = 32 }: { filename: string; size?: number }) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const style = FILE_TYPE_STYLES[ext] ?? { bg: "bg-muted", text: "text-muted-foreground", label: ext.toUpperCase().slice(0, 4) || "FILE" };
  const label = style.label.length > 4 ? style.label.slice(0, 4) : style.label;
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-md border border-black/5 dark:border-white/5 ${style.bg}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className={`text-[9px] font-bold leading-none tracking-tight ${style.text}`}>
        {label}
      </span>
    </div>
  );
}

// "split" excluded — parent docs are not directly reviewable; their children appear instead
const INBOX_STATES = ["uploaded", "processing", "needs_review", "failed_processing"] as const;

const STATE_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  needs_review: "Needs review",
  failed_processing: "Failed",
};

interface InboxClientProps {
  initialDocuments: DocumentRow[];
  tenantId: string;
}

// ── Per-row actions ────────────────────────────────────────────────────────────
// True when the document is a Supplier Portal notification email body that
// landed in the inbox before the Supplier Portal runner picked it up. Eligible for
// "Procesar como Supplier Portal" action.
function isCleoCandidate(doc: DocumentRow): boolean {
  if (doc.source_channel !== "email") return false;
  if (doc.mime_type !== "text/html") return false;
  if (!doc.source_meta?.inbound_email_id) return false;
  if (!["uploaded", "processing", "needs_review"].includes(doc.state)) return false;
  // Subject heuristic — Supplier Portal notifications come from datatrans-inc.com and the
  // email subject always ends in -<docType> (e.g. "-850").
  const name = doc.original_name?.toLowerCase() ?? "";
  return /arrival of data from/.test(name) || /-850/.test(name);
}

function ActionsCell({
  row,
  onRetry,
  onDelete,
  onRescan,
  onProcessCleo,
}: {
  row: Row<DocumentRow>;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRescan?: (doc: DocumentRow) => void;
  onProcessCleo?: (id: string) => void;
}) {
  const router = useRouter();
  const doc = row.original;

  if (doc._optimistic) return null;

  const canReview = doc.state === "needs_review";
  const canRetry = doc.state === "failed_processing";
  const cleoCandidate = isCleoCandidate(doc);

  return (
    <div className="flex items-center justify-end gap-1">
      {/* All actions: appear on row hover */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100">
        {cleoCandidate && (
          <button
            type="button"
            onClick={() => onProcessCleo?.(doc.id)}
            title="Descarga el PDF real desde Supplier Portal y archiva esta notificación HTML"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold tracking-tight",
              "border border-cyan-500/40 bg-cyan-500/8 text-cyan-700 dark:text-cyan-400",
              "hover:border-cyan-500 hover:bg-cyan-500 hover:text-white",
              "transition-all duration-150",
            )}
          >
            <Mail size={11} strokeWidth={2.5} />
            Procesar Supplier Portal
          </button>
        )}
        {canReview && (
          <button
            type="button"
            onClick={() => router.push(`/review/${doc.id}`)}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-[12px] font-semibold tracking-tight",
              "border border-amber-500/40 bg-amber-500/8 text-amber-700 dark:text-amber-400",
              "hover:border-amber-500 hover:bg-amber-500 hover:text-white",
              "transition-all duration-150",
            )}
          >
            Review
            <ArrowRight size={12} strokeWidth={2.5} />
          </button>
        )}
        {canRetry && (
          <button
            type="button"
            onClick={() => onRetry?.(doc.id)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-medium text-foreground",
              "hover:bg-muted transition-all duration-150",
            )}
          >
            <RotateCcw size={11} />
            Retry
          </button>
        )}
        {canReview && (
          <button
            type="button"
            onClick={() => onRescan?.(doc)}
            aria-label="Re-scan with AI"
            title="Re-scan with AI"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground/50 hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
          >
            <RotateCcw size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete?.(doc.id)}
          aria-label="Delete document"
          title="Delete"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Status badge — refined SaaS pattern with dot indicator ───────────────────
const BADGE_BASE =
  "inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-medium";

// ── Source channel badge ──────────────────────────────────────────────────────
function SourceBadge({ channel, onClick }: { channel: string; onClick?: () => void }) {
  const config: Record<string, { label: string; icon: string; cls: string }> = {
    upload:       { label: "Manual",  icon: "↑", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
    email:        { label: "Email",   icon: "✉", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    api:          { label: "API",     icon: "⚡", cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
    qr:           { label: "QR Scan", icon: "▣", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    browser:      { label: "Supplier Portal",    icon: "↓", cls: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
    cleo:         { label: "Supplier Portal",    icon: "↓", cls: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
    rithum:       { label: "Supplier Portal",  icon: "↓", cls: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
    walmart:      { label: "Marketplace", icon: "↓", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
    walmart_api:  { label: "Marketplace", icon: "↓", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  };
  const c = config[channel] ?? config.upload;
  const className = cn(
    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-medium",
    c.cls,
    onClick && "cursor-pointer transition-opacity hover:opacity-80",
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={className}
        aria-label={`Ver correo original (${c.label})`}
      >
        <span>{c.icon}</span>
        {c.label}
      </button>
    );
  }
  return (
    <span className={className}>
      <span>{c.icon}</span>
      {c.label}
    </span>
  );
}

function DocStatusBadge({ state }: { state: string }) {
  switch (state) {
    case "needs_review":
      return (
        <span
          className={cn(
            BADGE_BASE,
            "border border-amber-500/25 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
          )}
        >
          <span className="size-1.5 rounded-full bg-amber-500" />
          Needs review
        </span>
      );
    case "processing":
      return (
        <span
          className={cn(
            BADGE_BASE,
            "border border-blue-500/25 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
          )}
        >
          <Loader2 size={11} className="shrink-0 animate-spin" />
          Processing
        </span>
      );
    case "uploaded":
      return (
        <span className={cn(BADGE_BASE, "border border-border bg-muted/40 text-muted-foreground")}>
          <span className="size-1.5 rounded-full bg-muted-foreground/60" />
          Queued
        </span>
      );
    case "failed_processing":
      return (
        <span
          className={cn(
            BADGE_BASE,
            "border border-destructive/25 bg-destructive/8 text-destructive",
          )}
        >
          <AlertTriangleIcon size={11} className="shrink-0" />
          Failed
        </span>
      );
    default:
      return <Badge variant="outline">{STATE_LABELS[state] ?? state}</Badge>;
  }
}

// ── Main component ─────────────────────────────────────────────────────────────
export function InboxClient({ initialDocuments, tenantId }: InboxClientProps) {
  const router = useRouter();
  const t = useTranslations("inbox");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [documents, setDocuments] = useState<DocumentRow[]>(initialDocuments);
  const [uploading, setUploading] = useState(false);
  // Selector de tipo de documento al subir manualmente. Los archivos elegidos
  // quedan pendientes hasta que el usuario confirma el tipo en el diálogo.
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [uploadKind, setUploadKind] = useState<"auto" | "payment">("auto");
  const [dropzoneOpen, setDropzoneOpen] = useState(initialDocuments.length === 0);
  const [supabase] = useState(() => createClient());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [dismissedPipeline, setDismissedPipeline] = useState<Set<string>>(new Set());
  const [previewDoc, setPreviewDoc] = useState<{ id: string; name: string; mimeType?: string | null; sizeBytes?: number | null; pageCount?: number | null } | null>(null);
  const [rescanTarget, setRescanTarget] = useState<DocumentRow | null>(null);

  // DataGrid state
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [columnPinning] = useState<ColumnPinningState>({ right: ["actions"] });
  const [emailViewerId, setEmailViewerId] = useState<string | null>(null);
  const [integrationAlerts, setIntegrationAlerts] = useState<{ cleo_failed: number; rithum_failed: number } | null>(null);

  // Action chips dismiss
  const dismissedKey = `intake:inbox:dismissed:${tenantId}`;
  const [dismissedChips, setDismissedChips] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(dismissedKey);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
    } catch { return new Set(); }
  });

  const stableDocuments = useMemo(
    () => documents.filter((d) => !d._optimistic),
    [documents],
  );

  const failedCount = stableDocuments.filter((d) => d.state === "failed_processing").length;
  const failedDueToProvider = stableDocuments.some(
    (d) => d.state === "failed_processing" && (d.last_error ?? "").startsWith("ai_provider_unavailable"),
  );
  const reviewCount = stableDocuments.filter((d) => d.state === "needs_review").length;
  const processingCount = stableDocuments.filter((d) => d.state === "processing" || d.state === "uploaded").length;
  const firstReviewId = stableDocuments.find((d) => d.state === "needs_review")?.id ?? null;

  // Pipeline activity — docs actively uploading or being processed by AI
  const pipelineDocs = useMemo(() => {
    return documents.filter(
      (d) => d._optimistic || d.state === "processing" || d.state === "uploaded",
    ).filter((d) => !dismissedPipeline.has(d.id));
  }, [documents, dismissedPipeline]);

  const effectiveDismissedChips = useMemo(() => {
    const next = new Set(dismissedChips);
    if (failedCount === 0) next.delete("failed");
    if (reviewCount === 0) next.delete("review");
    return next;
  }, [dismissedChips, failedCount, reviewCount]);

  useEffect(() => {
    window.localStorage.setItem(dismissedKey, JSON.stringify([...effectiveDismissedChips]));
  }, [effectiveDismissedChips, dismissedKey]);

  useEffect(() => {
    fetch("/api/ingest/integration-alerts")
      .then((r) => r.json())
      .then((d) => {
        if ((d.cleo_failed ?? 0) > 0 || (d.rithum_failed ?? 0) > 0) {
          setIntegrationAlerts(d);
        }
      })
      .catch(() => {});
  }, []);

  const dismissChip = useCallback((key: "failed" | "review") => {
    setDismissedChips((prev) => new Set([...prev, key]));
  }, []);

  // Auto-dismiss pipeline entries that have completed, failed, or been split after 3s
  useEffect(() => {
    const completed = documents.filter(
      (d) => !d._optimistic && (d.state === "needs_review" || d.state === "failed_processing" || d.state === "split"),
    );
    if (completed.length === 0) return;
    const timer = setTimeout(() => {
      setDismissedPipeline((prev) => {
        const next = new Set(prev);
        completed.forEach((d) => next.add(d.id));
        return next;
      });
    }, 3500);
    return () => clearTimeout(timer);
  }, [documents]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Remove orphaned channels with this name before creating a new one.
    // Happens when the component remounts before the previous removeChannel resolves.
    const channelName = `inbox:tenant:${tenantId}`;
    supabase.getChannels()
      .filter(c => c.topic === `realtime:${channelName}`)
      .forEach(c => supabase.removeChannel(c));

    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;

    function subscribe() {
      const channel = supabase
        .channel(channelName)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "documents",
          filter: `tenant_id=eq.${tenantId}`,
        }, (payload) => {
          if (payload.eventType === "INSERT") {
            const doc = payload.new as DocumentRow;
            if (!(INBOX_STATES as readonly string[]).includes(doc.state)) return;
            setDocuments((prev) => {
              const optIdx = prev.findIndex((d) => d._optimistic && d.original_name === doc.original_name);
              if (optIdx !== -1) {
                const next = [...prev];
                next[optIdx] = doc;
                return next;
              }
              return [doc, ...prev];
            });
          }
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as DocumentRow;
            setDocuments((prev) => {
              if (!(INBOX_STATES as readonly string[]).includes(updated.state))
                return prev.filter((d) => d.id !== updated.id);
              return prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d));
            });
          }
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            retries = 0;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            supabase.removeChannel(channel);
            // Exponential backoff: 2s, 4s, 8s, max 30s
            const delay = Math.min(2000 * 2 ** retries, 30_000);
            retries += 1;
            retryTimeout = setTimeout(subscribe, delay);
          }
        });
      return channel;
    }

    const ch = subscribe();
    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      void supabase.removeChannel(ch);
    };
  }, [tenantId, supabase]);

  // ── Polling fallback para documentos en procesamiento ───────────────────────
  // Realtime puede perder eventos si el canal se cae brevemente. Cuando hay
  // docs en 'processing' o 'uploaded', consultamos la DB cada 8s para capturar
  // cualquier cambio de estado que haya llegado sin notificación.
  useEffect(() => {
    if (processingCount === 0) return;
    const id = setInterval(async () => {
      const ids = documents
        .filter((d) => !d._optimistic && (d.state === "processing" || d.state === "uploaded"))
        .map((d) => d.id);
      if (ids.length === 0) return;
      try {
        const { data } = await supabase
          .from("documents")
          .select("id, state, page_count, last_error")
          .in("id", ids);
        if (!data?.length) return;
        setDocuments((prev) =>
          prev.map((d) => {
            const u = (data as Array<{ id: string; state: string; page_count: number | null; last_error: string | null }>).find((r) => r.id === d.id);
            if (!u || u.state === d.state) return d;
            return { ...d, ...u };
          }),
        );
      } catch { /* best-effort */ }
    }, 8_000);
    return () => clearInterval(id);
  }, [processingCount, documents, supabase]);

  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async (files: File[], documentKind = "auto") => {
    setUploading(true);
    setDropzoneOpen(false);
    const optimisticRows: DocumentRow[] = files.map((f) => ({
      id: `_opt_${crypto.randomUUID()}`,
      original_name: f.name,
      state: "uploaded",
      page_count: null,
      created_at: new Date().toISOString(),
      credit_cost: null,
      _optimistic: true,
      _progress: 10,
    }));
    setDocuments((prev) => [...optimisticRows, ...prev]);

    const results = await Promise.allSettled(
      files.map(async (file, i) => {
        const optId = optimisticRows[i].id;
        const formData = new FormData();
        formData.append("file", file);
        formData.append("document_kind", documentKind);
        setDocuments((prev) => prev.map((d) => (d.id === optId ? { ...d, _progress: 40 } : d)));
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Upload failed" }));
          if (res.status === 429) {
            const retryAfter = (body as { retryAfterSec?: number }).retryAfterSec ?? 60;
            throw new Error(`Rate limit alcanzado. Reintenta en ~${retryAfter}s.`);
          }
          throw new Error((body as { error?: string }).error ?? "Upload failed");
        }
        setDocuments((prev) => prev.map((d) => (d.id === optId ? { ...d, _progress: 90 } : d)));
        return res.json() as Promise<{ documentId: string }>;
      }),
    );
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        const msg = result.reason instanceof Error ? result.reason.message : t("errors.uploadFailed");
        toast.error(msg);
        setDocuments((prev) => prev.filter((d) => d.id !== optimisticRows[i].id));
      }
    });
    setUploading(false);
  }, [t]);

  // Al elegir archivos NO subimos directo: abrimos el diálogo de tipo.
  const handleFilesChosen = useCallback((files: File[]) => {
    setUploadKind("auto");
    setPendingFiles(files);
  }, []);

  const confirmUpload = useCallback(() => {
    const files = pendingFiles;
    setPendingFiles(null);
    if (files && files.length > 0) void handleUpload(files, uploadKind);
  }, [pendingFiles, uploadKind, handleUpload]);

  // ── Retry ───────────────────────────────────────────────────────────────────
  const handleRetryAll = useCallback(async () => {
    const failedIds = documents.filter((d) => d.state === "failed_processing").map((d) => d.id);
    setDocuments((prev) => prev.map((d) => (failedIds.includes(d.id) ? { ...d, state: "processing" } : d)));
    await Promise.allSettled(failedIds.map((id) => fetch(`/api/retry/${id}`, { method: "POST" })));
  }, [documents]);

  const handleRetry = useCallback(async (id: string) => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, state: "processing" } : d)));
    try {
      const res = await fetch(`/api/retry/${id}`, { method: "POST" });
      if (!res.ok) throw new Error("Retry failed");
    } catch {
      toast.error(t("errors.uploadFailed"));
      setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, state: "failed_processing" } : d)));
    }
  }, [t]);

  // Re-scan = re-process a document already in needs_review (consumes AI tokens)
  const handleRescan = useCallback(async (id: string) => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, state: "processing" } : d)));
    try {
      const res = await fetch(`/api/retry/${id}`, { method: "POST" });
      if (!res.ok) throw new Error("Re-scan failed");
      toast.success("Re-scan started");
    } catch {
      toast.error("Could not re-scan document");
    }
  }, []);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    const original = documents.find((d) => d.id === id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    let undone = false;
    toast.success(t("actions.deleteSuccess"), {
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          if (original) setDocuments((prev) => [original, ...prev]);
        },
      },
      duration: 5000,
    });
    await new Promise((resolve) => setTimeout(resolve, 5200));
    if (undone) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("actions.deleteFailed"));
      if (original) setDocuments((prev) => [original, ...prev]);
    }
  }, [documents, t]);

  const handleProcessCleo = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const toastId = toast.loading(
        ids.length === 1
          ? "Descargando PDF desde Supplier Portal…"
          : `Procesando ${ids.length} notificaciones de Supplier Portal…`,
      );
      try {
        const r = await fetch("/api/ingest/cleo/scan-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_ids: ids }),
        });
        const body = (await r.json().catch(() => null)) as {
          dispatched?: number;
          archived?: number;
          errors?: Array<{ doc_id: string; reason: string }>;
        } | null;
        if (!r.ok || !body) {
          toast.error("Falló el procesamiento", { id: toastId });
          return;
        }
        const errCount = (body.errors ?? []).length;
        if (errCount > 0) {
          toast.error(
            `${body.dispatched ?? 0} OK, ${errCount} error(es). Ver consola.`,
            { id: toastId },
          );
          console.warn("processCleo errors", body.errors);
        } else {
          toast.success(
            `${body.dispatched ?? 0} orden(es) en Supplier Portal, ${body.archived ?? 0} HTML archivado(s)`,
            { id: toastId },
          );
        }
        setRowSelection({});
        setTimeout(() => router.refresh(), 1200);
      } catch (err) {
        toast.error(`Error: ${err instanceof Error ? err.message : "fallo"}`, { id: toastId });
      }
    },
    [],
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Object.keys(rowSelection);
    setRowSelection({});
    setDocuments((prev) => prev.filter((d) => !ids.includes(d.id)));
    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/documents/${id}`, { method: "DELETE" })),
    );
    const failed = ids.filter((_, i) =>
      results[i].status === "rejected" || !(results[i] as PromiseFulfilledResult<Response>).value?.ok,
    );
    if (failed.length > 0) {
      toast.error(t("actions.deleteFailed"));
      setDocuments((prev) => [...documents.filter((d) => failed.includes(d.id)), ...prev]);
    } else {
      toast.success(t("actions.deleteSuccess"));
    }
  }, [rowSelection, documents, t]);

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filteredData = useMemo(() => {
    return documents.filter((doc) => {
      const matchesStatus = !selectedStatuses.length || selectedStatuses.includes(doc.state);
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || doc.original_name.toLowerCase().includes(searchLower);
      return matchesStatus && matchesSearch;
    });
  }, [documents, searchQuery, selectedStatuses]);


  // ── Columns ─────────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<DocumentRow>[]>(
    () => [
      {
        id: "select",
        accessorKey: "id",
        header: () => <DataGridTableRowSelectAll />,
        cell: ({ row }) =>
          row.original._optimistic ? null : <DataGridTableRowSelect row={row} />,
        enableSorting: false,
        size: 36,
        enableResizing: false,
      },
      // ── Document (icon + name + #ID + relative time) ──
      {
        accessorKey: "original_name",
        id: "original_name",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("columns.document")} visibility column={column} />
        ),
        cell: ({ row }) => {
          const doc = row.original;
          const canPreview = !doc._optimistic;
          const num = doc.doc_number ?? doc.id.slice(0, 8).toUpperCase();
          const isSplit = doc.meta?.split_index && doc.meta?.split_total;

          const openPreview = () =>
            canPreview &&
            setPreviewDoc({
              id: doc.id,
              name: doc.original_name,
              mimeType: doc.mime_type,
              sizeBytes: doc.size_bytes,
              pageCount: doc.page_count,
            });

          return (
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                disabled={!canPreview}
                onClick={openPreview}
                className="shrink-0 transition-all hover:scale-105 hover:opacity-90 disabled:cursor-default"
                title={canPreview ? "Preview file" : undefined}
              >
                <FileTypeIcon filename={doc.original_name} size={36} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!canPreview}
                    onClick={openPreview}
                    className="min-w-0 truncate text-left text-[13.5px] font-semibold text-foreground transition-colors hover:text-primary"
                    title={doc.original_name}
                  >
                    {doc.original_name}
                  </button>
                  {isSplit && (
                    <span className="inline-flex shrink-0 items-center rounded-sm bg-amber-500/10 px-1 py-0.5 font-mono text-[9px] font-bold tabular-nums text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
                      part {doc.meta!.split_index}/{doc.meta!.split_total}
                    </span>
                  )}
                </div>
                {doc._optimistic && doc._progress !== undefined ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all duration-300" style={{ width: `${doc._progress}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">Uploading…</span>
                  </div>
                ) : (
                  <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                    #{num}
                  </span>
                )}
              </div>
            </div>
          );
        },
        enableSorting: true,
        enableHiding: false,
        enableResizing: true,
      },
      // ── Type (colored badge) ──
      {
        accessorKey: "mime_type",
        id: "mime_type",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("columns.type")} visibility column={column} />
        ),
        cell: ({ row }) => {
          const ext = row.original.original_name.split(".").pop()?.toLowerCase() ?? "";
          const style = FILE_TYPE_STYLES[ext] ?? {
            bg: "bg-muted",
            text: "text-muted-foreground",
            label: ext.toUpperCase().slice(0, 4) || "FILE",
          };
          return (
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                style.bg,
                style.text,
              )}
            >
              {style.label}
            </span>
          );
        },
        size: 80,
        enableSorting: true,
        enableHiding: true,
        enableResizing: false,
      },
      // ── Pages ──
      {
        accessorKey: "page_count",
        id: "page_count",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("columns.pages")} visibility column={column} />
        ),
        cell: ({ row }) => {
          const pc = row.original.page_count;
          if (pc == null) return <span className="text-muted-foreground/40">—</span>;
          return (
            <span className="font-mono text-[12px] text-foreground tabular-nums">
              {pc}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                {pc === 1 ? "pg" : "pgs"}
              </span>
            </span>
          );
        },
        size: 80,
        enableSorting: true,
        enableHiding: true,
        enableResizing: false,
      },
      // ── Size ──
      {
        accessorKey: "size_bytes",
        id: "size_bytes",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("columns.size")} visibility column={column} />
        ),
        cell: ({ row }) =>
          row.original.size_bytes ? (
            <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
              {formatBytes(row.original.size_bytes)}
            </span>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          ),
        size: 90,
        enableSorting: true,
        enableHiding: true,
        enableResizing: false,
      },
      // ── Source channel ──
      {
        accessorKey: "source_channel",
        id: "source_channel",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("columns.source")} visibility column={column} />
        ),
        cell: ({ row }) => {
          if (row.original._optimistic) return null;
          const ch = row.original.source_channel ?? "upload";
          const meta = row.original.meta;
          const isQr = meta && typeof meta === "object" && "source" in meta
            && (meta as Record<string, unknown>).source === "qr-scanner";
          const inboundEmailId = row.original.source_meta?.inbound_email_id ?? null;
          const onClick =
            ch === "email" && inboundEmailId
              ? () => setEmailViewerId(inboundEmailId)
              : undefined;
          // Usar source_meta.source para diferenciar Supplier Portal/Supplier Portal/Marketplace
          // (todos usan source_channel "browser" o "api" genérico).
          const metaSource = row.original.source_meta?.source as string | undefined;
          const displayChannel = isQr ? "qr" : (metaSource ?? ch);
          return <SourceBadge channel={displayChannel} onClick={onClick} />;
        },
        size: 90,
        enableSorting: true,
        enableHiding: true,
        enableResizing: false,
      },
      // ── Status ──
      {
        accessorKey: "state",
        id: "state",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("columns.status")} visibility column={column} />
        ),
        cell: ({ row }) => (
          <DocStatusBadge state={row.original._optimistic ? "uploaded" : row.original.state} />
        ),
        size: 160,
        minSize: 140,
        enableSorting: true,
        enableHiding: true,
        enableResizing: false,
      },
      // ── Uploaded + Last updated ──
      {
        accessorKey: "created_at",
        id: "created_at",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("columns.uploaded")} visibility column={column} />
        ),
        cell: ({ row }) => {
          const createdAt = row.original.created_at;
          const updatedAt = row.original.updated_at;
          const hasUpdate = updatedAt && updatedAt !== createdAt &&
            Math.abs(new Date(updatedAt).getTime() - new Date(createdAt).getTime()) > 60_000;
          return (
            <div className="flex flex-col gap-0.5">
              <span
                className="text-[11.5px] text-muted-foreground tabular-nums"
                title={formatFullTimestamp(createdAt, locale)}
              >
                {formatRelativeTime(createdAt, locale)}
              </span>
              {hasUpdate && (
                <span
                  className="text-[10px] text-blue-500 tabular-nums"
                  title={`Actualizado: ${formatFullTimestamp(updatedAt!, locale)}`}
                >
                  ↺ {formatRelativeTime(updatedAt!, locale)}
                </span>
              )}
            </div>
          );
        },
        size: 130,
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
      },
      // ── Actions ──
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <ActionsCell
            row={row}
            onRetry={handleRetry}
            onDelete={handleDelete}
            onRescan={setRescanTarget}
            onProcessCleo={(id) => handleProcessCleo([id])}
          />
        ),
        size: 150,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      },
    ],
    [handleRetry, handleDelete, setPreviewDoc, locale, setRescanTarget, handleProcessCleo],
  );

  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => columns.map((c) => c.id as string),
  );

  const table = useReactTable({
    columns,
    data: filteredData,
    pageCount: Math.ceil(filteredData.length / pagination.pageSize),
    getRowId: (row) => row.id,
    state: { pagination, sorting, columnOrder, rowSelection, columnPinning },
    columnResizeMode: "onChange",
    onColumnOrderChange: setColumnOrder,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <>
    <div className="flex h-full min-h-0 flex-col">

        <OnboardingBanner hasDocuments={stableDocuments.length > 0} />

        {integrationAlerts && (
          <div className="mb-3 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {(integrationAlerts.cleo_failed ?? 0) > 0 && (
                <span>
                  <strong>{integrationAlerts.cleo_failed}</strong> orden(es) de Supplier Portal fallaron —{" "}
                  <a href="/ingest/cleo" className="font-medium underline hover:no-underline">
                    Ver Supplier Portal
                  </a>
                </span>
              )}
              {(integrationAlerts.rithum_failed ?? 0) > 0 && (
                <span>
                  <strong>{integrationAlerts.rithum_failed}</strong> orden(es) de Supplier Portal fallaron —{" "}
                  <a href="/ingest/rithum" className="font-medium underline hover:no-underline">
                    Ver Supplier Portal
                  </a>
                </span>
              )}
            </div>
            <button
              type="button"
              className="ml-auto shrink-0 text-amber-700 hover:text-amber-900 dark:text-amber-400"
              onClick={() => setIntegrationAlerts(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Alerts ── */}
        {(failedCount > 0 && !effectiveDismissedChips.has("failed")) ||
         (reviewCount > 0 && !effectiveDismissedChips.has("review")) ? (
          <div className="flex flex-col gap-0 border-b border-border">
            {failedCount > 0 && !effectiveDismissedChips.has("failed") && (
              <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 last:border-b-0">
                <AlertTriangleIcon />
                <AlertTitle>
                  {failedDueToProvider
                    ? "Proveedor de IA no disponible"
                    : `${failedCount} ${failedCount === 1 ? "document" : "documents"} failed processing`}
                </AlertTitle>
                <AlertDescription>
                  {failedDueToProvider
                    ? "Anthropic está sobrecargado o no responde. Espera unos minutos y reprocesa."
                    : "Check file format or try reprocessing. Contact support if the issue persists."}
                </AlertDescription>
                <AlertAction>
                  <Button size="xs" variant="outline" onClick={() => setSelectedStatuses(["failed_processing"])}>
                    Filter
                  </Button>
                  <Button size="xs" onClick={() => { handleRetryAll(); dismissChip("failed"); }}>
                    Retry All
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => dismissChip("failed")}>
                    <XIcon />
                  </Button>
                </AlertAction>
              </Alert>
            )}
            {reviewCount > 0 && !effectiveDismissedChips.has("review") && (
              <Alert variant="warning" className="rounded-none border-x-0 border-t-0 last:border-b-0">
                <AlertTriangleIcon />
                <AlertTitle>
                  {reviewCount} {reviewCount === 1 ? "document needs" : "documents need"} your review
                </AlertTitle>
                <AlertDescription>
                  Review and approve or reject extracted data before syncing to ERP.
                </AlertDescription>
                <AlertAction>
                  <Button size="xs" onClick={() => setSelectedStatuses(["needs_review"])}>
                    Review Now
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => dismissChip("review")}>
                    <XIcon />
                  </Button>
                </AlertAction>
              </Alert>
            )}
          </div>
        ) : null}

        {/* ── Dropzone ── */}
        <UploadDropzone onUpload={handleFilesChosen} disabled={uploading} collapsed={!dropzoneOpen} />

        {/* Selector de tipo de documento al subir manualmente */}
        <Dialog open={pendingFiles !== null} onOpenChange={(o) => !o && setPendingFiles(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("docType.title")}</DialogTitle>
              <DialogDescription>{t("docType.subtitle")}</DialogDescription>
            </DialogHeader>
            <RadioGroup
              value={uploadKind}
              onValueChange={(v) => setUploadKind(v as "auto" | "payment")}
              className="gap-2"
            >
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 hover:bg-[var(--color-surface-mute)]">
                <RadioGroupItem value="auto" className="mt-0.5" />
                <span>
                  <span className="block text-sm text-[var(--color-fg)]">{t("docType.auto")}</span>
                  <span className="block text-xs text-[var(--color-fg-mute)]">{t("docType.autoHint")}</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 hover:bg-[var(--color-surface-mute)]">
                <RadioGroupItem value="payment" className="mt-0.5" />
                <span>
                  <span className="block text-sm text-[var(--color-fg)]">{t("docType.payment")}</span>
                  <span className="block text-xs text-[var(--color-fg-mute)]">{t("docType.paymentHint")}</span>
                </span>
              </label>
            </RadioGroup>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setPendingFiles(null)}>
                {tCommon("cancel")}
              </Button>
              <Button onClick={confirmUpload}>{t("docType.confirm")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Pipeline activity ── */}
        {pipelineDocs.length > 0 && (
          <PipelineActivityCard
            docs={pipelineDocs}
            onDismiss={(id) => setDismissedPipeline((prev) => new Set([...prev, id]))}
            onDismissAll={() => setDismissedPipeline(new Set(pipelineDocs.map((d) => d.id)))}
            onRetry={handleRetry}
          />
        )}

        {/* ── Data grid ── */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-5">
          <DataGrid
            table={table}
            recordCount={filteredData.length}
            emptyMessage={t("noData")}
            tableLayout={{
              columnsPinnable: true,
              columnsResizable: false,
              columnsMovable: true,
              columnsVisibility: true,
              width: "auto",
              headerSticky: true,
            }}
            tableClassNames={{
              bodyRow: "group/row hover:bg-muted/40 transition-colors",
            }}
          >
            <Card className="flex w-full min-h-0 flex-1 flex-col gap-0 py-0">
              {/* ── Workflow queue tabs ── */}
              <div className="flex items-center justify-between border-b px-4 py-0">
                <div className="flex items-center">
                  {/* To Review — critical state */}
                  <button
                    type="button"
                    onClick={() => setSelectedStatuses(selectedStatuses.includes("needs_review") && selectedStatuses.length === 1 ? [] : ["needs_review"])}
                    className={cn(
                      "relative flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
                      (selectedStatuses.includes("needs_review") && selectedStatuses.length === 1)
                        ? "border-amber-500 text-amber-600 dark:text-amber-400"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <AlertTriangleIcon size={14} />
                    {t("tabs.toReview")}
                    {reviewCount > 0 && (
                      <span className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1">
                        {reviewCount}
                      </span>
                    )}
                  </button>

                  {/* Processing */}
                  <button
                    type="button"
                    onClick={() => setSelectedStatuses(
                      selectedStatuses.length === 2 && selectedStatuses.includes("uploaded") && selectedStatuses.includes("processing") ? [] : ["uploaded", "processing"]
                    )}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
                      (selectedStatuses.includes("uploaded") || selectedStatuses.includes("processing")) && !selectedStatuses.includes("needs_review")
                        ? "border-blue-500 text-blue-600 dark:text-blue-400"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Loader2 size={14} className={processingCount > 0 ? "animate-spin" : ""} />
                    {t("tabs.processing")}
                    {processingCount > 0 && (
                      <span className="inline-flex items-center justify-center rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-bold min-w-[18px] h-[18px] px-1">
                        {processingCount}
                      </span>
                    )}
                  </button>

                  {/* Failed */}
                  {failedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedStatuses(selectedStatuses.includes("failed_processing") && selectedStatuses.length === 1 ? [] : ["failed_processing"])}
                      className={cn(
                        "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
                        selectedStatuses.includes("failed_processing") && selectedStatuses.length === 1
                          ? "border-destructive text-destructive"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <AlertTriangleIcon size={14} />
                      {t("tabs.failed")}
                      <span className="inline-flex items-center justify-center rounded-full bg-destructive/15 text-destructive text-[10px] font-bold min-w-[18px] h-[18px] px-1">
                        {failedCount}
                      </span>
                    </button>
                  )}

                  {/* All */}
                  <button
                    type="button"
                    onClick={() => setSelectedStatuses([])}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
                      selectedStatuses.length === 0
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t("tabs.allLabel")}
                    <span className="text-muted-foreground text-[11px] tabular-nums">
                      {stableDocuments.length}
                    </span>
                  </button>
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-2 py-2">
                  {/* Review next — critical CTA */}
                  {reviewCount > 0 && firstReviewId && selectedCount === 0 && (
                    <Button
                      asChild
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
                    >
                      <a href={`/${locale}/review/${firstReviewId}`}>
                        {t("header.reviewNext")}
                        <ArrowRight size={13} />
                      </a>
                    </Button>
                  )}

                  {/* Bulk: process selected Supplier Portal notifications */}
                  {selectedCount > 0 &&
                    (() => {
                      const cleoIds = Object.keys(rowSelection)
                        .map((id) => documents.find((d) => d.id === id))
                        .filter((d): d is DocumentRow => d != null && isCleoCandidate(d))
                        .map((d) => d.id);
                      if (cleoIds.length === 0) return null;
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-cyan-500/40 text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-400"
                          onClick={() => handleProcessCleo(cleoIds)}
                        >
                          <Mail size={12} className="mr-1" />
                          Procesar Supplier Portal ({cleoIds.length})
                        </Button>
                      );
                    })()}

                  {/* Bulk delete when selected */}
                  {selectedCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      {t("header.deleteSelected", { count: selectedCount })}
                    </Button>
                  )}

                  {/* Search */}
                  <InputGroup className="w-44">
                    <InputGroupAddon align="inline-start">
                      <SearchIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      placeholder={t("header.search")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery.length > 0 && (
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton size="icon-xs" onClick={() => setSearchQuery("")} aria-label={t("header.clearSearch")}>
                          <XIcon />
                        </InputGroupButton>
                      </InputGroupAddon>
                    )}
                  </InputGroup>

                  <Button onClick={() => setDropzoneOpen((v) => !v)} aria-expanded={dropzoneOpen}>
                    <Upload size={14} />
                    {t("header.uploadButton")}
                  </Button>
                </div>
              </div>

              <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden border-y px-0">
                <DataGridScrollArea className="min-h-0 flex-1">
                  <DataGridTable />
                </DataGridScrollArea>
              </CardContent>

              <CardFooter className="border-none bg-transparent! px-3.5 py-2">
                <DataGridPagination
                  rowsPerPageLabel={t("rowsPerPage")}
                  info={t.raw("pageRange") as string}
                />
              </CardFooter>
            </Card>
          </DataGrid>
        </main>
      </div>

      {/* ── File preview modal ── */}
      <FilePreviewModal
        documentId={previewDoc?.id ?? null}
        documentName={previewDoc?.name ?? ""}
        mimeType={previewDoc?.mimeType}
        sizeBytes={previewDoc?.sizeBytes}
        pageCount={previewDoc?.pageCount}
        onClose={() => setPreviewDoc(null)}
      />

      {/* ── Bulk delete confirmation ── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("actions.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("actions.deleteWarning")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { setBulkDeleteOpen(false); handleBulkDelete(); }}
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Re-scan with AI confirmation ── */}
      <AlertDialog open={!!rescanTarget} onOpenChange={(open) => { if (!open) setRescanTarget(null); }}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <AlertTriangleIcon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <AlertDialogTitle>Re-scan with AI</AlertDialogTitle>
                <AlertDialogDescription className="mt-1.5 text-[12px]">
                  This will re-process <strong>{rescanTarget?.original_name}</strong> through the AI pipeline and{" "}
                  <strong>consume tokens</strong> from your account. Currently extracted data will be replaced with the new results.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <div className="rounded-md border border-amber-400/25 bg-amber-50/60 px-3 py-2.5 text-[11px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
            💡 Use this only if the extracted data appears clearly incorrect.
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                if (rescanTarget) handleRescan(rescanTarget.id);
                setRescanTarget(null);
              }}
            >
              <RotateCcw size={13} />
              Yes, re-scan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <EmailViewerDrawer
        inboundEmailId={emailViewerId}
        open={emailViewerId !== null}
        onOpenChange={(o) => !o && setEmailViewerId(null)}
      />
    </>
  );
}


// ── Pipeline stage types & helpers ────────────────────────────────────────────
type PipelineStage = "uploading" | "queued" | "processing" | "split" | "done" | "error";

function getPipelineStage(doc: DocumentRow): PipelineStage {
  if (doc._optimistic) return "uploading";
  if (doc.state === "uploaded") return "queued";
  if (doc.state === "processing") return "processing";
  if (doc.state === "split") return "split";
  if (doc.state === "needs_review") return "done";
  if (doc.state === "failed_processing") return "error";
  return "done";
}

function stageToProgress(doc: DocumentRow, stage: PipelineStage): number {
  if (stage === "uploading") {
    const raw = doc._progress ?? 10;
    if (raw <= 10) return 20;
    if (raw <= 40) return 50;
    return 80;
  }
  if (stage === "queued") return 85;
  if (stage === "processing") return 92;
  if (stage === "split") return 100;
  if (stage === "done") return 100;
  return 0;
}

const STAGE_CONFIG: Record<
  PipelineStage,
  { label: string; message: (doc: DocumentRow) => string; color: string }
> = {
  uploading: {
    label: "upload",
    message: () => "transferring bytes to edge…",
    color: "text-cyan-400",
  },
  queued: {
    label: "queued",
    message: () => "waiting in processing queue…",
    color: "text-zinc-400",
  },
  processing: {
    label: "analyze",
    message: () => "running AI extraction pipeline…",
    color: "text-violet-400",
  },
  split: {
    label: "split",
    message: (doc) =>
      doc.meta?.split_count
        ? `split into ${doc.meta.split_count} documents — queuing children…`
        : "multi-document split detected — queuing children…",
    color: "text-amber-400",
  },
  done: {
    label: "done",
    message: () => "extraction complete — ready for review",
    color: "text-emerald-400",
  },
  error: {
    label: "error",
    message: () => "pipeline failed — retry to reprocess",
    color: "text-red-400",
  },
};

const PIPELINE_STEPS: { key: PipelineStage; label: string }[] = [
  { key: "uploading", label: "recv" },
  { key: "queued", label: "queue" },
  { key: "processing", label: "parse" },
  { key: "split", label: "split" },
  { key: "done", label: "ready" },
];

const STAGE_ORDER: PipelineStage[] = ["uploading", "queued", "processing", "split", "done"];

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function BrailleSpinner({ className }: { className?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % BRAILLE_FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return <span className={cn("font-mono tabular-nums", className)}>{BRAILLE_FRAMES[frame]}</span>;
}

// ── PipelineActivityCard ─────────────────────────────────────────────────────
// Single dark, tech-styled card that groups ALL active processing jobs.
// One compact row per job — filename, stage chip, inline progress, breadcrumb.
function PipelineActivityCard({
  docs,
  onDismiss,
  onDismissAll,
  onRetry,
}: {
  docs: DocumentRow[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onRetry?: (id: string) => void;
}) {
  // Aggregated stats for the header
  const activeCount = docs.filter((d) => {
    const s = getPipelineStage(d);
    return s !== "done" && s !== "error";
  }).length;
  const errorCount = docs.filter((d) => getPipelineStage(d) === "error").length;
  const overallProgress =
    docs.length > 0
      ? Math.round(
          docs.reduce((sum, d) => sum + stageToProgress(d, getPipelineStage(d)), 0) / docs.length,
        )
      : 0;

  return (
    <div className="mx-5 my-3 overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-black font-mono shadow-xl shadow-black/30 ring-1 ring-white/5">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between border-b border-zinc-800/70 bg-gradient-to-r from-zinc-900/90 via-zinc-950 to-zinc-950 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          {/* Traffic lights */}
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-rose-500/40 ring-1 ring-rose-500/20" />
            <span className="size-2.5 rounded-full bg-amber-500/40 ring-1 ring-amber-500/20" />
            <span className="size-2.5 rounded-full bg-emerald-500/40 ring-1 ring-emerald-500/20" />
          </div>
          <div className="h-3.5 w-px bg-zinc-800" />
          {activeCount > 0 ? (
            <BrailleSpinner className="text-violet-400 text-[12px]" />
          ) : (
            <span className="text-[12px] text-emerald-400">✓</span>
          )}
          <span className="shrink-0 text-[12px] font-semibold text-zinc-200">intake/process</span>
          {/* Tags */}
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-300">
              <span className="size-1 rounded-full bg-violet-400 motion-safe:animate-pulse" />
              {docs.length} {docs.length === 1 ? "job" : "jobs"}
            </span>
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                {errorCount} failed
              </span>
            )}
          </div>
          {/* Overall progress */}
          {activeCount > 0 && (
            <>
              <div className="hidden h-3.5 w-px bg-zinc-800 sm:block" />
              <div className="hidden items-center gap-2 sm:flex">
                <div className="h-1 w-20 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium tabular-nums text-zinc-400">
                  {overallProgress}%
                </span>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onDismissAll}
          className="shrink-0 rounded text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-200"
        >
          dismiss all
        </button>
      </div>

      {/* ── Job rows (compact one-line each) ── */}
      <div className="divide-y divide-zinc-800/40">
        {docs.map((doc) => {
          const stage = getPipelineStage(doc);
          const cfg = STAGE_CONFIG[stage];
          const progress = stageToProgress(doc, stage);
          const stageIdx = STAGE_ORDER.indexOf(stage === "error" ? "processing" : stage);
          const isActive = stage === "uploading" || stage === "queued" || stage === "processing" || stage === "split";
          const isError = stage === "error";

          // Stage chip background color
          const stageBg: Record<string, string> = {
            uploading: "bg-cyan-500/12 ring-cyan-500/25",
            queued: "bg-zinc-500/12 ring-zinc-500/25",
            processing: "bg-violet-500/12 ring-violet-500/25",
            split: "bg-amber-500/12 ring-amber-500/25",
            done: "bg-emerald-500/12 ring-emerald-500/25",
            error: "bg-red-500/12 ring-red-500/25",
          };

          return (
            <div
              key={doc.id}
              className="group/job grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-4 py-2 hover:bg-white/[0.015] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300"
            >
              {/* Stage chip */}
              <span
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-md ring-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider tabular-nums w-[78px] justify-center",
                  stageBg[stage],
                  cfg.color,
                )}
              >
                {isActive && <span className="size-1 rounded-full bg-current motion-safe:animate-pulse" />}
                {cfg.label}
              </span>

              {/* Filename */}
              <span className="min-w-0 truncate text-[12px] text-zinc-100" title={doc.original_name}>
                {doc.original_name}
              </span>

              {/* Inline progress */}
              {!isError ? (
                <div className="hidden shrink-0 items-center gap-2 sm:flex">
                  <div className="h-1 w-32 overflow-hidden rounded-full bg-zinc-800/80">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        stage === "done"
                          ? "bg-emerald-500"
                          : "bg-gradient-to-r from-violet-500 to-fuchsia-500",
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-[10px] font-medium tabular-nums text-zinc-500">
                    {progress}%
                  </span>
                </div>
              ) : (
                <span className="hidden shrink-0 items-center gap-1 text-[10px] text-red-400 sm:inline-flex">
                  pipeline failed
                </span>
              )}

              {/* Step breadcrumb (compact dots) */}
              <div className="hidden shrink-0 items-center gap-0.5 md:flex">
                {PIPELINE_STEPS.map((step, idx) => {
                  const isDone = stage === "done" || idx < stageIdx;
                  const isStepActive = idx === stageIdx && isActive;
                  return (
                    <span
                      key={step.key}
                      title={step.label}
                      className={cn(
                        "size-1.5 rounded-full transition-colors",
                        isDone && "bg-emerald-500",
                        isStepActive && "bg-violet-400 motion-safe:animate-pulse",
                        !isDone && !isStepActive && "bg-zinc-700",
                        isError && idx === stageIdx && "bg-red-500",
                      )}
                    />
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                {isError && onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(doc.id)}
                    className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300 transition-colors hover:bg-red-500/20"
                  >
                    retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDismiss(doc.id)}
                  aria-label="Dismiss"
                  className="flex size-5 items-center justify-center rounded text-zinc-600 opacity-0 transition-all hover:bg-white/5 hover:text-zinc-300 group-hover/job:opacity-100"
                >
                  <XIcon size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
