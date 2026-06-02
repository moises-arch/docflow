"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ProcessedSyncCell } from "./processed-sync-cell";
import { BulkActionBar } from "@/components/app/bulk-action-bar";
import { EmptyState } from "@/components/app/empty-state";
import { ERP_BASE_URL } from "@/lib/erp-url";
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
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileDown,
  FileText,
  Globe,
  ListChecks,
  Loader2,
  Lock,
  Mail,
  Package,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  XCircle,
  XIcon,
} from "lucide-react";
import { EmailViewerDrawer } from "@/components/app/email-viewer-drawer";
import {
  ColumnDef,
  type PaginationState,
  type SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SyncFilter = "all" | "synced" | "pending" | "in_progress" | "sync_failed" | "rejected";

export interface ProcessedRow {
  documentId: string;
  docNumber: string | null;
  documentState: string;
  draftId: string | null;
  documentName: string;
  hasFile: boolean;
  poNumber: string | null;
  customerName: string | null;
  total: number | null;
  currency: string | null;
  approvedAt: string;
  syncState: string;
  syncUpdatedAt: string | null;
  odooSoId: number | null;
  odooSoName: string | null;
  lastSyncError: string | null;
  aiCostUsd: number | null;
  sourceChannel: string | null;
  sourceMeta: Record<string, unknown>;
  inboundEmailId: string | null;
  isPoDuplicate: boolean;
}

interface ProcessedTableClientProps {
  rows: ProcessedRow[];
  title: string;
}

function formatMoney(value: number | null, currency: string | null, locale: string) {
  if (value === null) return "—";
  if (!currency) return value.toLocaleString(locale);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}


function formatAiCost(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `$${value.toFixed(4)}`;
}

// ── Source channel helpers ────────────────────────────────────────────────
type SourceInfo = { label: string; icon: React.ElementType; className: string };

function getSourceInfo(channel: string | null, meta: Record<string, unknown>): SourceInfo {
  const src = typeof meta.source === "string" ? meta.source : "";
  // Usar source_meta.source cuando está disponible para diferenciar Supplier Portal/Supplier Portal/Marketplace
  if (src === "cleo" || channel === "cleo")
    return { label: "Supplier Portal", icon: Globe, className: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-400" };
  if (src === "rithum")
    return { label: "Supplier Portal", icon: Globe, className: "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-400" };
  if (src === "walmart_api")
    return { label: "Marketplace", icon: Globe, className: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400" };
  if (channel === "email")
    return { label: "Email", icon: Mail, className: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400" };
  if (channel === "qr")
    return { label: "QR", icon: QrCode, className: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-400" };
  if (channel === "browser")
    return { label: "Supplier Portal", icon: Globe, className: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-400" };
  return { label: "Manual", icon: Upload, className: "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-mute)]" };
}

// ── Customer initials helper ──────────────────────────────────────────────
function customerInitials(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic color per customer name (so the same vendor always has the same color)
const AVATAR_COLORS = [
  "bg-blue-500/12 text-blue-700 dark:text-blue-400",
  "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  "bg-violet-500/12 text-violet-700 dark:text-violet-400",
  "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  "bg-rose-500/12 text-rose-700 dark:text-rose-400",
  "bg-cyan-500/12 text-cyan-700 dark:text-cyan-400",
  "bg-pink-500/12 text-pink-700 dark:text-pink-400",
  "bg-indigo-500/12 text-indigo-700 dark:text-indigo-400",
];

function colorForName(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function ProcessedTableClient({ rows: initialRows, title }: ProcessedTableClientProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("processed");
  const tCommon = useTranslations("common");

  const [query, setQuery] = useState("");
  const [syncFilter, setSyncFilter] = useState<SyncFilter>("all");
  const [rows, setRows] = useState(initialRows);
  const [showArchived, setShowArchived] = useState(false);
  const [rowSelection, setRowSelection] = useState({});
  const [sorting, setSorting] = useState<SortingState>([{ id: "approvedAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProcessedRow | null>(null);
  const [emailDrawerId, setEmailDrawerId] = useState<string | null>(null);

  // ── Derived data ────────────────────────────────────────────────────────
  const visibleRows = useMemo(
    () => (showArchived ? rows : rows.filter((row) => row.documentState !== "archived")),
    [rows, showArchived],
  );

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleRows.filter((row) => {
      if (syncFilter === "all") {
        // "All" excluye rejected y failed — esos tienen sus propias tabs
        if (row.syncState === "rejected" || row.syncState === "sync_failed") return false;
      } else if (row.syncState !== syncFilter) {
        return false;
      }
      if (q) {
        const haystack = [row.poNumber ?? "", row.customerName ?? "", row.documentName, row.odooSoName ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [query, visibleRows, syncFilter]);

  const syncedCount = visibleRows.filter((r) => r.syncState === "synced").length;
  const pendingCount = visibleRows.filter(
    (r) => r.syncState === "pending" || r.syncState === "in_progress",
  ).length;
  const failedCount = visibleRows.filter((r) => r.syncState === "sync_failed").length;
  const rejectedCount = visibleRows.filter((r) => r.syncState === "rejected").length;
  const issueCount = failedCount + rejectedCount;

  // ── Mutations ───────────────────────────────────────────────────────────
  const [syncingDrafts, setSyncingDrafts] = useState<Set<string>>(new Set());

  const handleManualSync = useCallback(
    async (draftId: string, documentId: string) => {
      setSyncingDrafts((prev) => new Set(prev).add(draftId));
      // Optimistic: show in_progress immediately
      setRows((prev) =>
        prev.map((r) =>
          r.documentId === documentId ? { ...r, syncState: "in_progress" } : r,
        ),
      );
      try {
        const res = await fetch(`/api/order-drafts/${draftId}/retry-sync`, { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          sync_state?: string;
          retryAfterSec?: number;
        };
        if (res.status === 429) {
          throw new Error(
            t("manualSync.rateLimit", { seconds: body.retryAfterSec ?? 60 }),
          );
        }
        if (!res.ok || body.ok === false) {
          throw new Error(body.error ?? t("manualSync.failed"));
        }
        toast.success(t("manualSync.started"));
        // Refresh the page in background after a short delay so the row reflects
        // the resolved sync_state once odoo-sync completes server-side.
        setTimeout(() => {
          router.refresh();
        }, 3000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("manualSync.failed"));
        // Revert optimistic state
        setRows((prev) => {
          const original = initialRows.find((r) => r.documentId === documentId);
          if (!original) return prev;
          return prev.map((r) => (r.documentId === documentId ? original : r));
        });
      } finally {
        setSyncingDrafts((prev) => {
          const next = new Set(prev);
          next.delete(draftId);
          return next;
        });
      }
    },
    [initialRows],
  );

  const handleArchive = useCallback(
    async (documentId: string) => {
      setRows((prev) => prev.filter((r) => r.documentId !== documentId));
      try {
        const res = await fetch(`/api/documents/${documentId}/archive`, { method: "POST" });
        if (!res.ok) throw new Error("Archive failed");
        toast.success(t("archiveSuccess"));
      } catch {
        toast.error(t("archiveFailed"));
        setRows((prev) => {
          const original = initialRows.find((r) => r.documentId === documentId);
          if (original) return [original, ...prev];
          return prev;
        });
      }
    },
    [t, initialRows],
  );

  const handleUnarchive = useCallback(
    async (documentId: string) => {
      setRows((prev) =>
        prev.map((r) => r.documentId === documentId ? { ...r, documentState: "needs_review" } : r),
      );
      try {
        const res = await fetch(`/api/documents/${documentId}/unarchive`, { method: "POST" });
        if (!res.ok) throw new Error("Unarchive failed");
        toast.success("Documento restaurado al inbox");
      } catch {
        toast.error("Error al desarchivar");
        setRows((prev) =>
          prev.map((r) => r.documentId === documentId ? { ...r, documentState: "archived" } : r),
        );
      }
    },
    [],
  );

  const handleDelete = useCallback(
    async (documentId: string) => {
      setRows((prev) => prev.filter((r) => r.documentId !== documentId));
      try {
        const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        toast.success(t("deleteSuccess"));
      } catch {
        toast.error(t("deleteFailed"));
        setRows((prev) => {
          const original = initialRows.find((r) => r.documentId === documentId);
          if (original) return [original, ...prev];
          return prev;
        });
      }
    },
    [t, initialRows],
  );

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((k) => (rowSelection as Record<string, boolean>)[k]),
    [rowSelection],
  );

  const handleBulkArchive = useCallback(async () => {
    const ids = [...selectedIds];
    setRowSelection({});
    setRows((prev) => prev.filter((r) => !ids.includes(r.documentId)));
    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/documents/${id}/archive`, { method: "POST" })),
    );
    const failed = ids.filter(
      (_, i) =>
        results[i].status === "rejected" || !(results[i] as PromiseFulfilledResult<Response>).value?.ok,
    );
    if (failed.length > 0) {
      toast.error(t("archiveFailed"));
      setRows((prev) => [...initialRows.filter((r) => failed.includes(r.documentId)), ...prev]);
    } else {
      toast.success(t("archiveSuccess"));
    }
  }, [selectedIds, initialRows, t]);

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    setRowSelection({});
    setRows((prev) => prev.filter((r) => !ids.includes(r.documentId)));
    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/documents/${id}`, { method: "DELETE" })),
    );
    const failed = ids.filter(
      (_, i) =>
        results[i].status === "rejected" || !(results[i] as PromiseFulfilledResult<Response>).value?.ok,
    );
    if (failed.length > 0) {
      toast.error(t("deleteFailed"));
      setRows((prev) => [...initialRows.filter((r) => failed.includes(r.documentId)), ...prev]);
    } else {
      toast.success(t("deleteSuccess"));
    }
  }, [selectedIds, initialRows, t]);

  // ── Columns ─────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<ProcessedRow>[]>(
    () => [
      {
        id: "select",
        header: () => <DataGridTableRowSelectAll />,
        cell: ({ row }) => <DataGridTableRowSelect row={row} />,
        size: 36,
        enableSorting: false,
        enableResizing: false,
      },
      {
        accessorKey: "docNumber",
        id: "docNumber",
        header: ({ column }) => <DataGridColumnHeader title={t("table.id")} column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-muted-foreground">
            #{row.original.docNumber ?? row.original.documentId.slice(0, 8).toUpperCase()}
          </span>
        ),
        size: 100,
        enableSorting: false,
      },
      {
        id: "source",
        header: ({ column }) => <DataGridColumnHeader title="Source" column={column} />,
        cell: ({ row }) => {
          const info = getSourceInfo(row.original.sourceChannel, row.original.sourceMeta ?? {});
          const Icon = info.icon;
          return (
            <div className="flex items-center gap-1">
              {row.original.inboundEmailId ? (
                <button
                  type="button"
                  title="Ver email"
                  onClick={(e) => { e.stopPropagation(); setEmailDrawerId(row.original.inboundEmailId); }}
                  className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-75", info.className)}
                >
                  <Icon size={9} />
                  {info.label}
                </button>
              ) : (
                <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium", info.className)}>
                  <Icon size={9} />
                  {info.label}
                </span>
              )}
            </div>
          );
        },
        size: 110,
        enableSorting: false,
      },
      {
        accessorKey: "syncState",
        id: "syncState",
        header: ({ column }) => <DataGridColumnHeader title={t("table.status")} column={column} />,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <ProcessedSyncCell
              syncState={row.original.syncState}
              draftId={row.original.draftId}
              odooSoId={row.original.odooSoId}
              lastSyncError={row.original.lastSyncError}
              updatedAt={row.original.syncUpdatedAt}
            />
            {row.original.isPoDuplicate && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                <AlertTriangle size={8} />
                PO ya en ERP
              </span>
            )}
          </div>
        ),
        size: 130,
      },
      {
        accessorKey: "poNumber",
        id: "poNumber",
        header: ({ column }) => <DataGridColumnHeader title={t("table.po")} column={column} />,
        cell: ({ row }) =>
          row.original.poNumber ? (
            <span className="font-mono text-[12.5px] font-medium text-foreground">
              {row.original.poNumber}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        size: 110,
      },
      {
        accessorKey: "customerName",
        id: "customerName",
        header: ({ column }) => <DataGridColumnHeader title={t("table.customer")} column={column} />,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase tracking-tight",
                colorForName(row.original.customerName),
              )}
            >
              {customerInitials(row.original.customerName)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-foreground">
                {row.original.customerName ?? "—"}
              </div>
              <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                <FileText size={10} className="shrink-0" />
                <span className="truncate">{row.original.documentName}</span>
              </div>
            </div>
          </div>
        ),
        size: 280,
      },
      {
        accessorKey: "odooSoName",
        id: "odooSoName",
        header: ({ column }) => <DataGridColumnHeader title={t("table.odooSO")} column={column} />,
        cell: ({ row }) =>
          row.original.syncState === "synced" && row.original.odooSoId && row.original.odooSoName ? (
            <a
              href={`${ERP_BASE_URL}/odoo/sales/${row.original.odooSoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded font-mono text-[12px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              {row.original.odooSoName}
              <ExternalLink size={10} className="opacity-60" />
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        size: 130,
      },
      {
        accessorKey: "total",
        id: "total",
        header: ({ column }) => <DataGridColumnHeader title={t("table.total")} column={column} />,
        cell: ({ row }) => (
          <div className="text-right font-mono font-semibold tabular-nums text-foreground">
            {formatMoney(row.original.total, row.original.currency, locale)}
          </div>
        ),
        size: 120,
      },
      {
        accessorKey: "approvedAt",
        id: "approvedAt",
        header: ({ column }) => <DataGridColumnHeader title={t("table.approved")} column={column} />,
        cell: ({ row }) => {
          const d = new Date(row.original.approvedAt);
          const dateStr = d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
          const timeStr = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true });
          return (
            <span className="flex flex-col tabular-nums">
              <span className="text-[11.5px] text-foreground">{dateStr}</span>
              <span className="text-[10.5px] text-muted-foreground">{timeStr}</span>
            </span>
          );
        },
        size: 130,
      },
      {
        accessorKey: "aiCostUsd",
        id: "aiCostUsd",
        header: ({ column }) => <DataGridColumnHeader title={t("table.aiCost")} column={column} />,
        cell: ({ row }) => {
          const cost = row.original.aiCostUsd;
          if (cost === null) return <span className="text-muted-foreground/40">—</span>;
          return (
            <div className="flex items-center justify-end gap-1.5">
              <span className="size-1.5 rounded-full bg-violet-500/60" />
              <span className="font-mono text-[12px] font-medium tabular-nums text-foreground">
                {formatAiCost(cost)}
              </span>
            </div>
          );
        },
        size: 110,
      },
      {
        id: "actions",
        header: () => null,
        cell: ({ row }) => {
          const canManualSync =
            row.original.draftId !== null &&
            (row.original.syncState === "pending" ||
              row.original.syncState === "sync_failed" ||
              row.original.syncState === "in_progress");
          const isSyncing = row.original.draftId !== null && syncingDrafts.has(row.original.draftId);
          return (
          <div className="flex items-center justify-end gap-2 opacity-0 transition-all duration-200 group-hover/row:opacity-100">
            <TooltipProvider delayDuration={300}>
              {row.original.draftId && row.original.syncState === "synced" && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={`/api/order-drafts/${row.original.draftId}/render-po`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Descargar Purchase Order PDF"
                        className="flex size-9 min-w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition-all duration-150 hover:scale-110 hover:bg-indigo-100 hover:shadow-md dark:bg-indigo-950/40 dark:text-indigo-400 dark:hover:bg-indigo-900/60"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FileDown size={17} />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-medium">
                      Descargar Purchase Order
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={`/api/order-drafts/${row.original.draftId}/render-packing-slip`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Descargar Packing Slip PDF"
                        className="flex size-9 min-w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 transition-all duration-150 hover:scale-110 hover:bg-emerald-100 hover:shadow-md dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Package size={17} />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-medium">
                      Descargar Packing Slip
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
              {row.original.hasFile && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={`/api/documents/${row.original.documentId}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("viewPdf")}
                      className="flex size-9 min-w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-all duration-150 hover:scale-110 hover:bg-blue-100 hover:shadow-md dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/60"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FileText size={17} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs font-medium">
                    Ver documento original
                  </TooltipContent>
                </Tooltip>
              )}
            </TooltipProvider>
            {canManualSync && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (row.original.draftId) {
                    void handleManualSync(row.original.draftId, row.original.documentId);
                  }
                }}
                disabled={isSyncing}
                aria-label={t("manualSync.label")}
                title={t("manualSync.label")}
                className="flex size-7 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"
              >
                {isSyncing ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
              </button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/review/${row.original.documentId}`}
                  aria-label="Ver review (locked)"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Lock size={13} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Ver review (locked)</TooltipContent>
            </Tooltip>
            {row.original.documentState === "archived" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleUnarchive(row.original.documentId); }}
                    aria-label="Desarchivar"
                    className="flex size-7 items-center justify-center rounded-md text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
                  >
                    <ArchiveRestore size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Desarchivar</TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleArchive(row.original.documentId); }}
                aria-label={t("archive")}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Archive size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(row.original);
              }}
              aria-label={t("delete")}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 size={13} />
            </button>
          </div>
          );
        },
        size: 180,
        enableSorting: false,
        enableResizing: false,
      },
    ],
    [locale, t, handleArchive, handleUnarchive, handleManualSync, syncingDrafts, setEmailDrawerId],
  );

  // ── Table ───────────────────────────────────────────────────────────────
  const table = useReactTable({
    columns,
    data: filteredRows,
    getRowId: (row: ProcessedRow) => row.documentId,
    state: { sorting, pagination, rowSelection },
    columnResizeMode: "onChange",
    enableRowSelection: true,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selectedCount = selectedIds.length;
  const hasActiveFilters = query !== "" || syncFilter !== "all";

  // ── Tab definitions ─────────────────────────────────────────────────────
  type TabDef = { id: SyncFilter; label: string; count: number; icon: typeof CheckCircle2; activeColor: string; iconColor: string };
  const tabs: TabDef[] = [
    { id: "all",         label: t("tabs.all"),       count: visibleRows.filter((r) => r.syncState !== "rejected" && r.syncState !== "sync_failed").length, icon: ListChecks,    activeColor: "border-foreground text-foreground",                          iconColor: "" },
    { id: "synced",      label: t("tabs.synced"),    count: syncedCount,        icon: CheckCircle2,  activeColor: "border-emerald-500 text-emerald-600 dark:text-emerald-400", iconColor: "text-emerald-500" },
    { id: "pending",     label: t("tabs.pending"),   count: pendingCount,       icon: Clock,         activeColor: "border-blue-500 text-blue-600 dark:text-blue-400",          iconColor: "text-blue-500" },
    { id: "sync_failed", label: t("tabs.failed"),    count: failedCount,        icon: AlertTriangle, activeColor: "border-destructive text-destructive",                       iconColor: "text-destructive" },
    { id: "rejected",    label: t("tabs.rejected"),  count: rejectedCount,      icon: XCircle,       activeColor: "border-amber-500 text-amber-600 dark:text-amber-400",       iconColor: "text-amber-500" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/30">
      {/* ── Page header with KPIs ── */}
      <header className="shrink-0 border-b border-border bg-background px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
              {t("header.eyebrow")}
            </p>
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{t("header.subtitle")}</p>
          </div>

          {/* ── KPI strip ── */}
          <div className="flex shrink-0 items-stretch divide-x divide-border rounded-md border border-border bg-card">
            <Kpi
              label={t("kpis.totalVolume")}
              value={formatMoney(
                visibleRows.reduce((sum, r) => sum + (r.total ?? 0), 0),
                visibleRows.find((r) => r.currency)?.currency ?? "USD",
                locale,
              )}
              tone="neutral"
            />
            <Kpi
              label={t("kpis.successRate")}
              value={
                visibleRows.length > 0
                  ? `${Math.round((syncedCount / visibleRows.length) * 100)}%`
                  : "—"
              }
              tone={
                visibleRows.length === 0
                  ? "neutral"
                  : syncedCount === visibleRows.length
                    ? "success"
                    : issueCount > 0
                      ? "danger"
                      : "info"
              }
            />
            <Kpi
              label={t("kpis.totalOrders")}
              value={String(visibleRows.length)}
              tone="neutral"
              hint={issueCount > 0 ? t("kpis.needAttention", { count: issueCount }) : t("kpis.allClear")}
              hintTone={issueCount > 0 ? "danger" : "success"}
            />
            {/* AI consumption — sums ALL rows including archived */}
            <Kpi
              label={t("kpis.aiConsumption")}
              value={formatAiCost(
                rows.reduce((sum, r) => sum + (r.aiCostUsd ?? 0), 0),
              )}
              tone="info"
              hint={t("kpis.scans", { count: rows.filter((r) => r.aiCostUsd !== null).length })}
            />
          </div>
        </div>
      </header>

      {/* ── Issue alerts (stacked, dismissible by clicking the filter tab) ── */}
      {issueCount > 0 && (
        <div className="flex flex-col gap-0 border-b border-border">
          {failedCount > 0 && (
            <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 last:border-b-0">
              <AlertTriangle />
              <AlertTitle>
                {t("alerts.failedTitle", { count: failedCount })}
              </AlertTitle>
              <AlertDescription>
                {t("alerts.failedDesc")}
              </AlertDescription>
              <AlertAction>
                <Button size="xs" variant="outline" onClick={() => setSyncFilter("sync_failed")}>
                  {t("alerts.showFailed")}
                </Button>
              </AlertAction>
            </Alert>
          )}
          {rejectedCount > 0 && (
            <Alert variant="warning" className="rounded-none border-x-0 border-t-0 last:border-b-0">
              <AlertTriangle />
              <AlertTitle>
                {t("alerts.rejectedTitle", { count: rejectedCount })}
              </AlertTitle>
              <AlertDescription>
                {t("alerts.rejectedDesc")}
              </AlertDescription>
              <AlertAction>
                <Button size="xs" variant="outline" onClick={() => setSyncFilter("rejected")}>
                  {t("alerts.showRejected")}
                </Button>
              </AlertAction>
            </Alert>
          )}
        </div>
      )}

      {/* ── Data grid card ── */}
      <main className="min-h-0 flex-1 overflow-auto p-5">
        <DataGrid
          table={table}
          recordCount={filteredRows.length}
          tableLayout={{
            columnsResizable: true,
            headerSticky: true,
          }}
          tableClassNames={{
            headerSticky: "sticky top-0 z-10 bg-muted/80 backdrop-blur-md border-b",
            bodyRow: "group/row cursor-pointer hover:bg-muted/40 transition-colors",
          }}
        >
          <Card className="w-full gap-0 py-0">
            {/* ── Toolbar: tabs + search + actions ── */}
            <div className="flex items-center justify-between border-b px-4">
              <div className="flex items-center overflow-x-auto">
                {tabs.map((tab) => {
                  const isActive = syncFilter === tab.id;
                  // "All" is always clickable; others only when they have rows
                  const isClickable = tab.id === "all" || tab.count > 0 || isActive;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => isClickable && setSyncFilter(tab.id)}
                      disabled={!isClickable}
                      title={!isClickable ? `No ${tab.label.toLowerCase()} orders` : undefined}
                      className={cn(
                        "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] font-medium transition-colors",
                        isActive
                          ? tab.activeColor
                          : isClickable
                            ? "border-transparent text-muted-foreground hover:text-foreground"
                            : "border-transparent text-muted-foreground/40 cursor-not-allowed",
                      )}
                    >
                      <tab.icon size={13} className={isActive ? tab.iconColor : ""} />
                      {tab.label}
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                          isActive
                            ? "bg-foreground/10 text-foreground"
                            : tab.count > 0
                              ? "bg-muted text-muted-foreground"
                              : "bg-muted/50 text-muted-foreground/50",
                          "h-4 min-w-4",
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

                <div className="flex shrink-0 items-center gap-2 py-2">
                  {selectedCount > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkArchiveOpen(true)}
                        className="gap-1.5"
                      >
                        <Archive size={12} />
                        Archive {selectedCount}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkDeleteOpen(true)}
                        className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 size={12} />
                        Delete {selectedCount}
                      </Button>
                      <span className="mx-1 h-4 w-px bg-border" />
                    </>
                  )}

                  <InputGroup className="w-52">
                    <InputGroupAddon align="inline-start">
                      <Search />
                    </InputGroupAddon>
                    <InputGroupInput
                      placeholder={t("filters.searchPlaceholder")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query.length > 0 && (
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton size="icon-xs" onClick={() => setQuery("")} aria-label="Clear">
                          <XIcon />
                        </InputGroupButton>
                      </InputGroupAddon>
                    )}
                  </InputGroup>

                  <Button
                    variant={showArchived ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowArchived((v) => !v)}
                    className="gap-1.5"
                  >
                    <Archive size={12} />
                    {showArchived ? t("hideArchived") : t("showArchived")}
                  </Button>
                </div>
              </div>

            <CardContent className="p-0">
              {filteredRows.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <EmptyState
                    icon={ListChecks}
                    title={
                      hasActiveFilters
                        ? syncFilter !== "all"
                          ? `No ${tabs.find((t2) => t2.id === syncFilter)?.label.toLowerCase()} orders`
                          : t("noResults")
                        : t("empty")
                    }
                    subtitle={
                      hasActiveFilters
                        ? syncFilter !== "all"
                          ? "Try a different filter or clear your search"
                          : undefined
                        : t("emptySubtitle")
                    }
                  />
                </div>
              ) : (
                <DataGridScrollArea>
                  <DataGridTable />
                </DataGridScrollArea>
              )}
            </CardContent>

            {filteredRows.length > 0 && (
              <CardFooter className="border-t bg-transparent! px-3.5 py-2">
                <DataGridPagination />
              </CardFooter>
            )}
          </Card>
        </DataGrid>
      </main>

      {/* ── Bulk action bar (floating bottom) ── */}
      <BulkActionBar
        selectedCount={selectedCount}
        onClearSelection={() => setRowSelection({})}
        actions={[
          { label: t("archive"), icon: Archive, onClick: () => setBulkArchiveOpen(true) },
          { label: t("delete"), icon: Trash2, onClick: () => setBulkDeleteOpen(true) },
        ]}
      />

      {/* ── Bulk archive confirmation ── */}
      <AlertDialog open={bulkArchiveOpen} onOpenChange={setBulkArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("archive")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tCommon("bulkSelected", { count: selectedCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setBulkArchiveOpen(false);
                handleBulkArchive();
              }}
            >
              {t("archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Single delete confirmation ── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <AlertDialogTitle>Delete order?</AlertDialogTitle>
                <AlertDialogDescription className="mt-1.5 text-[12px]">
                  You are about to permanently delete{" "}
                  <strong>
                    {deleteTarget?.poNumber || deleteTarget?.documentName || "this order"}
                  </strong>
                  . This action cannot be undone.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-[11px] text-destructive">
            ⚠ Tip: if you only want to hide this from the list, use <strong>Archive</strong> instead.
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget.documentId);
                setDeleteTarget(null);
              }}
            >
              <Trash2 size={13} />
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk delete confirmation ── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteConfirm", { count: selectedCount })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("deleteWarning")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                setBulkDeleteOpen(false);
                handleBulkDelete();
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EmailViewerDrawer
        inboundEmailId={emailDrawerId}
        open={emailDrawerId !== null}
        onOpenChange={(open) => { if (!open) setEmailDrawerId(null); }}
      />
    </div>
  );
}

// ── Compact KPI block for the hero ──────────────────────────────────────
type KpiTone = "neutral" | "success" | "info" | "danger";
function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
  hintTone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  hintTone?: KpiTone;
}) {
  const valueColor: Record<KpiTone, string> = {
    neutral: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    info: "text-blue-600 dark:text-blue-400",
    danger: "text-destructive",
  };
  const hintColor: Record<KpiTone, string> = {
    neutral: "text-muted-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    info: "text-blue-600 dark:text-blue-400",
    danger: "text-destructive",
  };
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2 first:rounded-l-md last:rounded-r-md min-w-[120px]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {label}
      </p>
      <p className={cn("text-[18px] font-bold tabular-nums leading-tight", valueColor[tone])}>
        {value}
      </p>
      {hint && (
        <p className={cn("text-[10.5px] font-medium leading-tight", hintColor[hintTone])}>
          {hint}
        </p>
      )}
    </div>
  );
}
