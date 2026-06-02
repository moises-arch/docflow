"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileText,
  FolderInput,
  Loader2,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { toast } from "sonner";
import type { DocumentLogRow } from "@/app/api/settings/providers/[id]/documents/route";
import {
  DataGrid,
  DataGridContainer,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";

interface DocumentLogProps {
  providerId: string;
}

export function DocumentLog({ providerId }: DocumentLogProps) {
  const locale = useLocale();
  const t = useTranslations("settings.providers.documentLog");
  const [rows, setRows] = useState<DocumentLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [openDoc, setOpenDoc] = useState<DocumentLogRow | null>(null);
  const [moveDoc, setMoveDoc] = useState<DocumentLogRow | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const url = new URL(
          `/api/settings/providers/${providerId}/documents`,
          window.location.origin,
        );
        url.searchParams.set("limit", "100");
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { items: DocumentLogRow[] };
        if (active) setRows(body.items);
      } catch {
        toast.error(t("loadError"));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [providerId]);

  const columns = useMemo<ColumnDef<DocumentLogRow>[]>(
    () => [
      {
        accessorKey: "documentName",
        id: "documentName",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("colDocument")} column={column} />
        ),
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setOpenDoc(row.original)}
            className="flex items-center gap-2 min-w-0 text-left hover:underline focus:outline-none group"
          >
            <FileText size={13} className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden="true" />
            <span className="truncate text-sm font-medium text-foreground">
              {row.original.documentName}
            </span>
          </button>
        ),
        size: 280,
        enableSorting: false,
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("colReceived")} column={column} />
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDate(row.original.createdAt, locale)}
          </span>
        ),
        size: 120,
        sortingFn: "datetime",
      },
      {
        accessorKey: "poNumber",
        id: "poNumber",
        header: ({ column }) => (
          <DataGridColumnHeader title="PO #" column={column} /> /* PO # is a universal abbreviation */
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">
            {row.original.poNumber ?? "—"}
          </span>
        ),
        size: 110,
        enableSorting: false,
      },
      {
        accessorKey: "customerName",
        id: "customerName",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("colCustomer")} column={column} />
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground truncate">
            {row.original.customerName ?? "—"}
          </span>
        ),
        size: 160,
        enableSorting: false,
      },
      {
        accessorKey: "total",
        id: "total",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("colTotal")} column={column} className="justify-end" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm text-foreground text-right block">
            {formatMoney(row.original.total, row.original.currency, locale)}
          </span>
        ),
        size: 100,
        enableSorting: false,
        meta: { cellClassName: "text-right" },
      },
      {
        accessorKey: "documentState",
        id: "documentState",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("colState")} column={column} />
        ),
        cell: ({ row }) => <StateBadge state={row.original.documentState} />,
        size: 130,
        enableSorting: false,
      },
      {
        accessorKey: "syncState",
        id: "syncState",
        header: ({ column }) => (
          <DataGridColumnHeader title={t("colSync")} column={column} />
        ),
        cell: ({ row }) => <SyncBadge state={row.original.syncState} />,
        size: 110,
        enableSorting: false,
      },
      {
        id: "action",
        header: () => null,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMoveDoc(row.original);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground whitespace-nowrap"
              title={t("actionMove")}
            >
              <FolderInput size={11} aria-hidden="true" />
              {t("actionMove")}
            </button>
            <ActionLink row={row.original} />
          </div>
        ),
        size: 160,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [locale, t],
  );

  const table = useReactTable({
    columns,
    data: rows,
    pageCount: Math.ceil(rows.length / pagination.pageSize),
    getRowId: (row) => row.documentId,
    state: { pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center text-sm text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  return (
    <>
      <DataGrid table={table} recordCount={rows.length} isLoading={loading}>
        <div className="space-y-3">
          <DataGridContainer>
            <DataGridScrollArea>
              <DataGridTable />
            </DataGridScrollArea>
          </DataGridContainer>
          <DataGridPagination />
        </div>
      </DataGrid>

      {openDoc && (
        <DocumentDialog doc={openDoc} onClose={() => setOpenDoc(null)} />
      )}

      {moveDoc && (
        <MoveDialog
          doc={moveDoc}
          currentProviderId={providerId}
          onClose={() => setMoveDoc(null)}
          onMoved={() => {
            const movedId = moveDoc.documentId;
            setMoveDoc(null);
            setRows((prev) => prev.filter((r) => r.documentId !== movedId));
          }}
        />
      )}
    </>
  );
}

type ProviderOption = {
  id: string;
  name: string;
  code: string;
};

function MoveDialog({
  doc,
  currentProviderId,
  onClose,
  onMoved,
}: {
  doc: DocumentLogRow;
  currentProviderId: string;
  onClose: () => void;
  onMoved: () => void;
}) {
  const t = useTranslations("settings.providers.documentLog");
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [movingTo, setMovingTo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/settings/providers");
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { items: ProviderOption[] };
        if (active) setProviders(body.items.filter((p) => p.id !== currentProviderId));
      } catch {
        toast.error(t("loadError"));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [currentProviderId, t]);

  const filtered = providers.filter((p) => {
    const haystack = `${p.name} ${p.code}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  async function moveTo(targetId: string) {
    if (movingTo) return;
    setMovingTo(targetId);
    try {
      const res = await fetch(`/api/documents/${doc.documentId}/move-provider`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_provider_id: targetId }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; provider_name?: string; error?: string }
        | null;
      if (res.ok && body?.ok) {
        toast.success(t("movedTo", { name: body.provider_name ?? "" }));
        onMoved();
      } else {
        toast.error(body?.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fallo");
    } finally {
      setMovingTo(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
        style={{ maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderInput size={14} aria-hidden="true" />
              {t("moveTitle")}
            </h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">{doc.documentName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={t("closeLabel")}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-[var(--color-border)] p-3">
          <label className="relative block">
            <Search
              size={13}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchProvider")}
              autoFocus
              className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] pr-2.5 pl-8 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--color-fg)]"
            />
          </label>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("noProviders")}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => moveTo(p.id)}
                    disabled={movingTo !== null}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors",
                      "hover:bg-muted/50 disabled:cursor-wait disabled:opacity-60",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {p.code}
                      </p>
                    </div>
                    {movingTo === p.id ? (
                      <Loader2 size={13} className="animate-spin shrink-0" />
                    ) : (
                      <ArrowUpRight size={13} className="shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentDialog({ doc, onClose }: { doc: DocumentLogRow; onClose: () => void }) {
  const t = useTranslations("settings.providers.documentLog");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
        style={{ height: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="truncate text-sm font-semibold text-foreground">{doc.documentName}</p>
            {doc.poNumber && (
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                PO {doc.poNumber}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ActionLink row={doc} />
            <button
              type="button"
              onClick={onClose}
              className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={t("closeLabel")}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* PDF viewer */}
        <div className="min-h-0 flex-1 bg-zinc-100 dark:bg-zinc-900">
          <iframe
            src={`/api/documents/${doc.documentId}/download`}
            title={doc.documentName}
            className="h-full w-full"
          />
        </div>
      </div>
    </div>
  );
}

function ActionLink({ row }: { row: DocumentLogRow }) {
  const t = useTranslations("settings.providers.documentLog");
  const isReview = row.documentState === "needs_review";
  const isProcessed = ["reviewed", "rejected", "archived"].includes(row.documentState);
  if (isReview) {
    return (
      <Link
        href={`/review/${row.documentId}`}
        className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-500 hover:underline whitespace-nowrap"
      >
        {t("actionReview")} <ArrowUpRight size={11} aria-hidden="true" />
      </Link>
    );
  }
  if (isProcessed) {
    return (
      <Link
        href={`/processed?doc=${row.documentId}`}
        className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground whitespace-nowrap"
      >
        {t("actionOpen")} <ArrowUpRight size={11} aria-hidden="true" />
      </Link>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

const STATE_COLORS: Record<string, string> = {
  uploaded: "bg-muted text-muted-foreground",
  processing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  needs_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  reviewed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed_processing: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  rejected: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  archived: "bg-muted text-muted-foreground",
};

function StateBadge({ state }: { state: string }) {
  const cls = STATE_COLORS[state] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase whitespace-nowrap", cls)}>
      {state.replace(/_/g, " ")}
    </span>
  );
}

const SYNC_COLORS: Record<string, string> = {
  none: "bg-muted text-muted-foreground",
  pending: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  synced: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  sync_failed: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  rejected: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

function SyncBadge({ state }: { state: string }) {
  const cls = SYNC_COLORS[state] ?? "bg-muted text-muted-foreground";
  const Icon = state === "synced" ? CheckCircle2 : state.includes("fail") || state === "rejected" ? XCircle : Clock3;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase whitespace-nowrap", cls)}>
      <Icon size={10} aria-hidden="true" />
      {state.replace(/_/g, " ")}
    </span>
  );
}

function formatMoney(value: number | null, currency: string | null, locale: string) {
  if (value === null) return "—";
  try {
    return currency
      ? new Intl.NumberFormat(locale, { style: "currency", currency }).format(value)
      : value.toLocaleString(locale);
  } catch {
    return value.toLocaleString(locale);
  }
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}
