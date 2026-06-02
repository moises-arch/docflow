"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  X,
  AlertTriangle,
  ExternalLink,
  Zap,
  RefreshCw,
} from "lucide-react";
import { ERP_BASE_URL } from "@/lib/erp-url";

interface InboxItem {
  document_id: string;
  draft_id: string | null;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  state: string;
  sync_state: string;
  odoo_so_id: number | null;
  odoo_so_name: string | null;
  po_number: string | null;
  total: number | null;
  currency: string | null;
  customer_name: string | null;
  last_error: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
  is_qr: boolean;
}

interface PendingUpload {
  id: string;
  name: string;
  sizeBytes: number;
  status: "uploading" | "error";
  error?: string;
}

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const POLL_MS = 4000;

type Stage = "uploading" | "processing" | "review" | "syncing" | "synced" | "failed";

function stageFor(item: InboxItem): Stage {
  if (item.state === "uploaded") return "uploading";
  if (item.state === "processing") return "processing";
  if (item.state === "failed_processing") return "failed";
  if (item.sync_state === "synced") return "synced";
  if (item.sync_state === "sync_failed") return "failed";
  if (item.sync_state === "pending" || item.sync_state === "in_progress") return "syncing";
  return "review";
}

const STAGE_LABEL: Record<Stage, string> = {
  uploading: "Subiendo",
  processing: "Leyendo con IA",
  review: "Listo para ERP",
  syncing: "Enviando a ERP",
  synced: "En ERP",
  failed: "Necesita revisión",
};

const STAGE_TONE: Record<Stage, string> = {
  uploading: "text-zinc-500",
  processing: "text-zinc-700",
  review: "text-zinc-900",
  syncing: "text-zinc-700",
  synced: "text-emerald-700",
  failed: "text-rose-700",
};

export function ScanClient({ token, expiresAt: _expiresAt }: { token: string; expiresAt: string }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const fetchInbox = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`/api/scan/${token}/documents`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: InboxItem[] };
      setItems(data.items ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchInbox(true);
    const id = setInterval(() => void fetchInbox(true), POLL_MS);
    return () => clearInterval(id);
  }, [fetchInbox]);

  // Upload
  const uploadOne = useCallback(
    async (file: File) => {
      const placeholderId = crypto.randomUUID();
      setPending((p) => [
        ...p,
        { id: placeholderId, name: file.name, sizeBytes: file.size, status: "uploading" },
      ]);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/scan/${token}/upload`, { method: "POST", body: fd });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `Upload falló (${res.status})`);
        }
        setPending((p) => p.filter((x) => x.id !== placeholderId));
        void fetchInbox(true);
      } catch (e) {
        setPending((p) =>
          p.map((x) =>
            x.id === placeholderId
              ? { ...x, status: "error", error: e instanceof Error ? e.message : "Falló" }
              : x,
          ),
        );
      }
    },
    [token, fetchInbox],
  );

  const enqueue = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((f) => void uploadOne(f));
    },
    [uploadOne],
  );

  const openFile = useCallback(
    async (documentId: string) => {
      try {
        const res = await fetch(`/api/scan/${token}/documents/${documentId}/file`);
        if (!res.ok) return;
        const data = (await res.json()) as { url: string };
        if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
      } catch {
        /* ignore */
      }
    },
    [token],
  );

  const pushOne = useCallback(
    async (documentId: string) => {
      setPushingId(documentId);
      try {
        const res = await fetch(`/api/scan/${token}/documents/${documentId}/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        void fetchInbox(true);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { detail?: string; error?: string };
          alert(j.detail || j.error || "No se pudo generar el SO");
        }
      } finally {
        setPushingId(null);
      }
    },
    [token, fetchInbox],
  );

  const dismissPending = (id: string) => setPending((p) => p.filter((x) => x.id !== id));

  const counts = useMemo(() => {
    const synced = items.filter((i) => i.sync_state === "synced").length;
    const failed = items.filter(
      (i) => i.state === "failed_processing" || i.sync_state === "sync_failed",
    ).length;
    const inFlight =
      pending.filter((p) => p.status === "uploading").length +
      items.filter(
        (i) =>
          i.state === "uploaded" ||
          i.state === "processing" ||
          i.sync_state === "pending" ||
          i.sync_state === "in_progress",
      ).length;
    return { synced, failed, inFlight };
  }, [items, pending]);

  const allItems = [...pending, ...items];

  return (
    <div className="relative min-h-[100dvh] bg-zinc-50 text-zinc-900">
      {/* Subtle gradient backdrop — anti-flat without going neon */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 20% 0%, rgba(16,185,129,0.12), transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col">
        {/* Header — minimal, brand + counters */}
        <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-zinc-50/85 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 pt-[max(env(safe-area-inset-top),14px)]">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="size-2 rounded-full bg-emerald-500" />
                <div className="absolute inset-0 size-2 rounded-full bg-emerald-500 [animation:ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite]" />
              </div>
              <div>
                <p className="text-[12.5px] font-semibold tracking-tight leading-none">
                  DocFlow Capture
                </p>
                <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-zinc-500">
                  DocFlow
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void fetchInbox()}
              disabled={refreshing}
              className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
              aria-label="Refrescar"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Counter strip — no card, just a divided row */}
          {allItems.length > 0 && (
            <div className="grid grid-cols-3 divide-x divide-zinc-200/80 border-t border-zinc-200/80 bg-white/60">
              <Counter label="En vuelo" value={counts.inFlight} tone="zinc" />
              <Counter label="En ERP" value={counts.synced} tone="emerald" />
              <Counter label="Revisar" value={counts.failed} tone="rose" />
            </div>
          )}
        </header>

        {/* Body */}
        <main className="flex-1 px-5 pb-[160px] pt-5">
          {loading && allItems.length === 0 ? (
            <SkeletonList />
          ) : allItems.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2.5">
              {pending.map((p) => (
                <PendingRow key={p.id} item={p} onDismiss={() => dismissPending(p.id)} />
              ))}
              {items.map((it) => (
                <ItemRow
                  key={it.document_id}
                  item={it}
                  pushing={pushingId === it.document_id}
                  onOpen={() => void openFile(it.document_id)}
                  onPush={() => void pushOne(it.document_id)}
                />
              ))}
            </ul>
          )}
        </main>

        {/* Action bar — sticky bottom */}
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200/80 bg-zinc-50/90 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),14px)] backdrop-blur-md">
          <div className="mx-auto flex max-w-md gap-2.5">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="
                group relative flex flex-1 items-center justify-center gap-2 rounded-2xl
                bg-zinc-950 px-5 py-3.5 text-[14px] font-semibold text-white
                shadow-[0_10px_28px_-12px_rgba(24,24,27,0.55)]
                transition-all duration-200
                hover:bg-zinc-800 active:scale-[0.98] active:translate-y-[1px]
              "
            >
              <Camera size={15} strokeWidth={2} />
              Tomar foto
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="
                flex size-[52px] shrink-0 items-center justify-center rounded-2xl
                border border-zinc-300 bg-white text-zinc-700
                transition-all duration-200
                hover:bg-zinc-100 active:scale-[0.96]
              "
              aria-label="Subir archivo"
            >
              <Upload size={15} strokeWidth={2} />
            </button>
          </div>
          <p className="mt-2.5 text-center text-[10px] text-zinc-500">
            PDF · JPG · PNG · WEBP hasta 25 MB
          </p>
        </div>

        {/* Hidden inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) enqueue(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) enqueue(e.target.files);
            e.currentTarget.value = "";
          }}
        />
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "zinc" | "emerald" | "rose";
}) {
  const colors = {
    zinc: "text-zinc-900",
    emerald: "text-emerald-700",
    rose: "text-rose-700",
  } as const;
  return (
    <div className="px-2 py-2.5 text-center">
      <p className={`font-mono text-[18px] font-semibold tabular-nums leading-none ${colors[tone]}`}>
        {value}
      </p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </p>
    </div>
  );
}

function PendingRow({
  item,
  onDismiss,
}: {
  item: PendingUpload;
  onDismiss: () => void;
}) {
  return (
    <li className="group flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-3.5 py-3 shadow-[0_1px_0_rgba(24,24,27,0.02)]">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
        <FileText size={14} strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-zinc-900">{item.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {item.status === "error" ? (
            <>
              <AlertTriangle size={10} className="text-rose-600" />
              <p className="text-[10.5px] text-rose-700">{item.error ?? "Falló"}</p>
            </>
          ) : (
            <>
              <Loader2 size={10} className="animate-spin text-zinc-500" />
              <p className="text-[10.5px] text-zinc-500">Subiendo…</p>
            </>
          )}
        </div>
      </div>
      {item.status === "error" && (
        <button
          onClick={onDismiss}
          className="flex size-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Descartar"
        >
          <X size={13} />
        </button>
      )}
    </li>
  );
}

function ItemRow({
  item,
  pushing,
  onOpen,
  onPush,
}: {
  item: InboxItem;
  pushing: boolean;
  onOpen: () => void;
  onPush: () => void;
}) {
  const stage = stageFor(item);
  const canPush = stage === "review" || stage === "failed";
  const isSynced = stage === "synced";

  return (
    <li
      className={`
        rounded-2xl border bg-white px-4 py-3.5 shadow-[0_1px_0_rgba(24,24,27,0.02)]
        transition-all
        ${isSynced ? "border-emerald-200/70" : "border-zinc-200/80"}
      `}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="
            flex size-10 shrink-0 items-center justify-center rounded-xl
            bg-zinc-100 text-zinc-600
            transition-colors hover:bg-zinc-200 hover:text-zinc-900
            active:scale-[0.96]
          "
          aria-label="Ver archivo"
        >
          <FileText size={14} strokeWidth={1.8} />
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block w-full truncate text-left text-[13px] font-medium text-zinc-900 hover:text-zinc-600"
          >
            {item.original_name ?? item.document_id.slice(0, 8)}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
            <StageBadge stage={stage} />
            {item.po_number && (
              <span className="font-mono text-[10px] text-zinc-500">
                PO·{item.po_number}
              </span>
            )}
            {item.customer_name && (
              <span className="text-[10px] text-zinc-500 truncate">
                · {item.customer_name}
              </span>
            )}
          </div>
          {item.odoo_so_name && (
            <a
              href={`${ERP_BASE_URL}/odoo/sales/${item.odoo_so_id ?? ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="
                mt-2 inline-flex items-center gap-1 rounded-md
                border border-emerald-300/60 bg-emerald-50 px-2 py-0.5
                font-mono text-[10.5px] font-semibold text-emerald-800
                transition-colors hover:bg-emerald-100
              "
            >
              {item.odoo_so_name}
              <ExternalLink size={9} />
            </a>
          )}
          {(item.last_sync_error || item.last_error) && (
            <p className="mt-1.5 line-clamp-2 text-[10.5px] text-rose-600">
              {item.last_sync_error ?? item.last_error}
            </p>
          )}
        </div>
      </div>

      {canPush && (
        <button
          type="button"
          disabled={pushing}
          onClick={onPush}
          className="
            mt-3 flex w-full items-center justify-center gap-1.5
            rounded-xl border border-zinc-900 bg-zinc-950 px-3 py-2.5
            text-[12.5px] font-semibold text-white
            transition-all hover:bg-zinc-800 active:scale-[0.98]
            disabled:opacity-50
          "
        >
          {pushing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
          {pushing ? "Generando…" : "Generar ERP SO"}
        </button>
      )}
    </li>
  );
}

function StageBadge({ stage }: { stage: Stage }) {
  const tone = STAGE_TONE[stage];
  const label = STAGE_LABEL[stage];

  if (stage === "synced") {
    return (
      <span className={`inline-flex items-center gap-1 ${tone}`}>
        <CheckCircle2 size={11} strokeWidth={2.2} />
        <span className="text-[10.5px] font-medium">{label}</span>
      </span>
    );
  }
  if (stage === "failed") {
    return (
      <span className={`inline-flex items-center gap-1 ${tone}`}>
        <AlertTriangle size={11} strokeWidth={2} />
        <span className="text-[10.5px] font-medium">{label}</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      <Loader2 size={11} className="animate-spin" />
      <span className="text-[10.5px] font-medium">{label}</span>
    </span>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2.5">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3.5"
        >
          <div className="size-10 shrink-0 rounded-xl bg-zinc-100 animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-2.5 w-2/3 rounded-full bg-zinc-100 animate-pulse" />
            <div className="h-2 w-1/3 rounded-full bg-zinc-100 animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return (
    <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/60 px-6 py-14 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500">
        <Camera size={18} strokeWidth={1.6} />
      </div>
      <p className="mt-4 text-[14px] font-medium tracking-tight text-zinc-900">
        Empezá tomando una foto
      </p>
      <p className="mt-1.5 text-[11.5px] text-zinc-500">
        Fotografiá la orden o subí un PDF. La IA lo procesa y genera el SO en ERP.
      </p>
    </div>
  );
}
