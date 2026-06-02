"use client";

import { useState, useRef, useEffect } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { StatusBadge, type BadgeVariant } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SkeletonTable } from "@/components/ui/skeleton-table";
import { SmartEmptyState } from "@/components/app/smart-empty-state";
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
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { RotateCcw, FileText, ArrowRight, Trash2, Loader2 } from "lucide-react";
import { formatRelativeTime, formatFullTimestamp } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface DocumentRow {
  id: string;
  original_name: string;
  state: string;
  page_count: number | null;
  created_at: string;
  credit_cost?: number | null;
  _optimistic?: boolean;
  _progress?: number;
}

const INBOX_STATES = new Set(["uploaded", "processing", "needs_review", "failed_processing"]);
const DELETABLE_STATES = new Set(["uploaded", "processing", "failed_processing", "needs_review"]);

interface DocumentsTableProps {
  documents: DocumentRow[];
  loading?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onUploadClick?: () => void;
}

export function DocumentsTable({
  documents,
  loading,
  selectedIds,
  onSelectionChange,
  onRetry,
  onDelete,
  onUploadClick,
}: DocumentsTableProps) {
  const t = useTranslations("inbox");
  const tStatus = useTranslations("status");
  const locale = useLocale();
  const router = useRouter();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const selectable = selectedIds !== undefined && onSelectionChange !== undefined;

  // Track state changes for flash animation
  const prevStatesRef = useRef<Map<string, string>>(new Map());
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const prev = prevStatesRef.current;
    const changed = new Set<string>();
    for (const doc of documents) {
      const prevState = prev.get(doc.id);
      if (prevState !== undefined && prevState !== doc.state && !doc._optimistic) {
        changed.add(doc.id);
      }
      prev.set(doc.id, doc.state);
    }
    if (changed.size > 0) {
      setFlashedIds((s) => new Set([...s, ...changed]));
      const timer = setTimeout(() => {
        setFlashedIds((s) => {
          const next = new Set(s);
          changed.forEach((id) => next.delete(id));
          return next;
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [documents]);

  // Only non-optimistic rows with selectable states count for header checkbox
  const selectableRows = documents.filter((d) => !d._optimistic && DELETABLE_STATES.has(d.state));
  const allSelected =
    selectable && selectableRows.length > 0 && selectableRows.every((d) => selectedIds.has(d.id));
  const someSelected = selectable && selectableRows.some((d) => selectedIds.has(d.id));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      // deselect all selectable from this table
      const next = new Set(selectedIds);
      selectableRows.forEach((d) => next.delete(d.id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      selectableRows.forEach((d) => next.add(d.id));
      onSelectionChange(next);
    }
  };

  const toggleRow = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const columnHelper = createColumnHelper<DocumentRow>();

  const columns = [
    // ── Checkbox ──────────────────────────────────────────────────────────────
    ...(selectable
      ? [
          columnHelper.display({
            id: "select",
            size: 44,
            header: () => (
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ),
            cell: ({ row }) => {
              const { id, state, _optimistic } = row.original;
              const isSelectable = !_optimistic && DELETABLE_STATES.has(state);
              if (!isSelectable) return null;
              return (
                <div className="flex items-center justify-center">
                  <Checkbox
                    checked={selectedIds.has(id)}
                    onCheckedChange={() => toggleRow(id)}
                    aria-label={`Select ${row.original.original_name}`}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              );
            },
          }),
        ]
      : []),

    // ── Status ─────────────────────────────────────────────────────────────────
    columnHelper.accessor("state", {
      id: "status",
      header: t("columns.status"),
      size: 128,
      cell: ({ getValue, row }) => {
        const state = row.original._optimistic ? "uploaded" : (getValue() as BadgeVariant);
        return <StatusBadge status={state} label={tStatus(state)} className="h-6 px-2" />;
      },
    }),

    // ── File ───────────────────────────────────────────────────────────────────
    columnHelper.accessor("original_name", {
      id: "file",
      header: t("columns.file"),
      cell: ({ getValue, row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] text-[var(--color-fg-mute)]">
            <FileText size={15} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <span
              className="block min-w-0 truncate text-sm font-medium text-[var(--color-fg)]"
              title={getValue()}
            >
              {getValue()}
            </span>
            {row.original._optimistic && row.original._progress !== undefined && (
              <div
                className="mt-1 h-1 w-32 max-w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface-mute)]"
                role="progressbar"
                aria-valuenow={row.original._progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-[color:var(--color-blue)] transition-all duration-300"
                  style={{ width: `${row.original._progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      ),
    }),

    // ── Uploaded ───────────────────────────────────────────────────────────────
    columnHelper.accessor("created_at", {
      id: "uploaded",
      header: t("columns.uploaded"),
      size: 100,
      cell: ({ getValue }) => (
        <span
          className="font-mono text-xs text-[var(--color-fg-mute)]"
          title={formatFullTimestamp(getValue(), locale)}
        >
          {formatRelativeTime(getValue(), locale)}
        </span>
      ),
    }),

    // ── Pages ──────────────────────────────────────────────────────────────────
    columnHelper.accessor("page_count", {
      id: "pages",
      header: t("columns.pages"),
      size: 64,
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-[var(--color-fg-mute)] tabular-nums">
          {getValue() ?? "—"}
        </span>
      ),
    }),

    // ── Credits ────────────────────────────────────────────────────────────────
    columnHelper.accessor("credit_cost", {
      id: "credits",
      header: t("columns.credits"),
      size: 72,
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-[var(--color-fg-mute)] tabular-nums">
          {getValue() ?? "—"}
        </span>
      ),
    }),

    // ── Row actions ────────────────────────────────────────────────────────────
    columnHelper.display({
      id: "actions",
      header: "",
      size: 100,
      cell: ({ row }) => {
        const { id, state, _optimistic } = row.original;
        if (_optimistic) return null;

        const canDelete = DELETABLE_STATES.has(state);

        return (
          <div className="flex items-center justify-end gap-1">
            {state === "needs_review" && (
              <Button
                size="sm"
                variant="default"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/review/${id}`);
                }}
                className="h-7 gap-1 px-2.5 text-xs"
              >
                {t("actions.review")}
                <ArrowRight size={11} aria-hidden="true" />
              </Button>
            )}
            {state === "failed_processing" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry?.(id);
                }}
                className="h-7 gap-1 px-2 text-xs text-[color:var(--color-rose)]"
              >
                <RotateCcw size={11} aria-hidden="true" />
                {t("actions.retry")}
              </Button>
            )}
            {state === "processing" && (
              <Button
                size="sm"
                variant="outline"
                disabled
                className="h-7 gap-1.5 border-[color:var(--color-blue)]/30 bg-[color:var(--color-blue)]/5 px-2 text-xs text-[color:var(--color-blue)]"
              >
                <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                <span className="animate-pulse">{tStatus("processing")}</span>
              </Button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDeleteId(id);
                }}
                aria-label={t("actions.delete")}
                className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-fg-mute)] opacity-0 transition-opacity duration-[120ms] group-hover/row:opacity-100 hover:bg-[var(--color-rose)]/10 hover:text-[color:var(--color-rose)]"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      },
    }),
  ];

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table owns internal mutable helpers.
  const table = useReactTable({ data: documents, columns, getCoreRowModel: getCoreRowModel() });

  if (loading) {
    return (
      <SkeletonTable rows={6} colWidths={["w-5", "w-28", "w-48", "w-20", "w-10", "w-10", "w-16"]} />
    );
  }

  if (documents.length === 0) {
    return <SmartEmptyState onUpload={onUploadClick} />;
  }

  return (
    <>
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("actions.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("actions.deleteWarning")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[color:var(--color-rose)] text-white hover:bg-[color:var(--color-rose)]/90"
              onClick={() => {
                if (pendingDeleteId) onDelete?.(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <table className="w-full text-sm" role="table">
        <thead className="sticky top-0 z-10 bg-[var(--color-surface-mute)]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-[var(--color-border)]">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-wide whitespace-nowrap text-[var(--color-fg-mute)] uppercase"
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const { state, _optimistic } = row.original;
            const isClickable = state === "needs_review" && !_optimistic;
            const isSelected = selectable && selectedIds.has(row.original.id);

            return (
              <tr
                key={row.id}
                className={cn(
                  "group/row border-b border-[var(--color-border)] last:border-b-0",
                  "transition-colors duration-[120ms] hover:bg-[var(--color-surface-mute)]",
                  isClickable && "cursor-pointer",
                  _optimistic && "opacity-60",
                  !INBOX_STATES.has(state) && "hidden",
                  isSelected && "bg-[var(--color-surface-mute)]",
                  flashedIds.has(row.original.id) && "row-state-flash",
                )}
                onClick={() => {
                  if (isClickable) router.push(`/review/${row.original.id}`);
                }}
                aria-label={row.original.original_name}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
