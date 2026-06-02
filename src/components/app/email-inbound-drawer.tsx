// Drawer global de Email Inbound — abre desde abajo con vaul,
// snapPoints [0.5, 0.95]. Layout horizontal: lista a la izquierda,
// detalle a la derecha. Comparte la página /integrations/email-inbound
// (esta es atajo rápido; aquella es la vista completa).
"use client";

import { useEffect, useMemo, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MinusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import type { EmailListItem } from "@/app/[locale]/(app)/integrations/email-inbound/email-inbound-client";

// ── Helpers ────────────────────────────────────────────────────────────────

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const DOMAIN_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-pink-500",
  "bg-indigo-500",
];

function domainColor(email: string) {
  const d = email.split("@")[1] ?? "";
  let h = 0;
  for (const c of d) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return DOMAIN_COLORS[Math.abs(h) % DOMAIN_COLORS.length];
}

function initials(name: string | null, email: string) {
  const src = name?.trim() ?? email;
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatBytes(b: number) {
  if (b < 1024) return `${b}B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(0)}KB`;
  return `${(b / 1_048_576).toFixed(1)}MB`;
}

const STATUS_CFG: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    dot: string;
    badge: string;
  }
> = {
  processed: {
    label: "Processed",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
  },
  processing: {
    label: "Processing",
    icon: Clock3,
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    dot: "bg-rose-500",
    badge:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900",
  },
  ignored: {
    label: "Ignored",
    icon: MinusCircle,
    dot: "bg-slate-300 dark:bg-slate-600",
    badge:
      "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  },
};

type FilterKey = "all" | "processed" | "processing" | "failed" | "ignored";

const FILTERS: { key: FilterKey; label: string; dot?: string }[] = [
  { key: "all", label: "All" },
  { key: "processed", label: "Processed", dot: "bg-emerald-500" },
  { key: "processing", label: "Processing", dot: "bg-amber-500" },
  { key: "failed", label: "Failed", dot: "bg-rose-500" },
  { key: "ignored", label: "Ignored", dot: "bg-slate-400" },
];

function SenderAvatar({
  name,
  email,
  sm,
}: {
  name: string | null;
  email: string;
  sm?: boolean;
}) {
  const sz = sm ? "size-6 text-[9px]" : "size-7 text-[10px]";
  return (
    <div
      className={cn(
        sz,
        domainColor(email),
        "rounded-full flex items-center justify-center text-white font-bold shrink-0",
      )}
    >
      {initials(name, email)}
    </div>
  );
}

function StatusBadge({ state }: { state: string }) {
  const cfg = STATUS_CFG[state] ?? STATUS_CFG.ignored;
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold whitespace-nowrap",
        cfg.badge,
      )}
    >
      <Icon size={9} />
      {cfg.label}
    </span>
  );
}

// ── Email row ──────────────────────────────────────────────────────────────

function EmailRow({
  item,
  selected,
  onClick,
}: {
  item: EmailListItem;
  selected: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CFG[item.state] ?? STATUS_CFG.ignored;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full text-left px-3 py-2.5 border-b border-[var(--color-border)] flex items-start gap-2.5 transition-colors duration-100",
        selected ? "bg-[var(--color-bg)]" : "hover:bg-[var(--color-bg)]/60",
      )}
    >
      <div className="flex flex-col items-center gap-1.5 pt-0.5">
        <SenderAvatar name={item.fromName} email={item.fromEmail} />
        <span className={cn("size-1.5 rounded-full", cfg.dot)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1 mb-0.5">
          <span className="text-[12px] font-semibold text-[var(--color-fg)] truncate">
            {item.fromName ?? item.fromEmail.split("@")[0]}
          </span>
          <span className="text-[9px] text-[var(--color-fg-subtle)] tabular-nums shrink-0">
            {relTime(item.receivedAt)}
          </span>
        </div>
        <div className="text-[11px] font-medium text-[var(--color-fg-mute)] truncate mb-0.5">
          {item.subject ?? <span className="italic opacity-60">No subject</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-[var(--color-fg-subtle)] truncate">
            @{item.fromEmail.split("@")[1]}
          </span>
          <StatusBadge state={item.state} />
        </div>
      </div>
      <ChevronRight
        size={11}
        className={cn(
          "shrink-0 mt-1 text-[var(--color-fg-subtle)] transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-60",
        )}
      />
    </button>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────

type EmailDetail = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  state: string;
  adapter: string | null;
  recipients: string[];
  html_url: string | null;
  text_url: string | null;
  raw_url: string | null;
  attachments: Array<{
    id: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    state: string;
    document_id: string | null;
    download_url: string | null;
  }>;
};

const REPROCESS_CFG: Record<
  string,
  { label: string; primary: boolean; note: string | null }
> = {
  processed: {
    label: "Re-procesar",
    primary: false,
    note: "Este email ya fue procesado. Re-procesarlo puede crear documentos duplicados.",
  },
  failed: { label: "Enviar al pipeline", primary: true, note: null },
  ignored: {
    label: "Enviar al pipeline",
    primary: true,
    note: "Email ignorado — sin adjuntos válidos o sin proveedor detectado.",
  },
  processing: {
    label: "Forzar re-proceso",
    primary: false,
    note: "Solo forzar si lleva más de 15 min sin avanzar.",
  },
};

function DetailPanel({
  emailId,
  onClose,
  onReprocessed,
}: {
  emailId: string;
  onClose: () => void;
  onReprocessed: (id: string) => void;
}) {
  const locale = useLocale();
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [view, setView] = useState<"html" | "text">("html");
  const [reprocessing, setReprocessing] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDetail(null);
    setHtmlContent(null);
    setTextContent(null);
    fetch(`/api/inbound-emails/${emailId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as EmailDetail;
      })
      .then((d) => {
        if (!active) return;
        setDetail(d);
        setView(d.html_url ? "html" : "text");
        if (d.html_url) {
          fetch(d.html_url)
            .then((r) => r.text())
            .then((html) => {
              if (active) setHtmlContent(html);
            })
            .catch(() => {});
        }
        if (d.text_url) {
          fetch(d.text_url)
            .then((r) => r.text())
            .then((txt) => {
              if (active) setTextContent(txt);
            })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [emailId]);

  async function reprocess() {
    if (reprocessing) return;
    setReprocessing(true);
    try {
      const res = await fetch(`/api/inbound-emails/${emailId}/reprocess`, { method: "POST" });
      const body = (await res.json()) as { ok?: boolean; reprocessed?: number };
      if (res.ok && body.ok) {
        toast.success(`Re-procesando ${body.reprocessed} documento(s)`);
        onReprocessed(emailId);
        onClose();
      } else toast.error("No se pudo re-procesar el email");
    } catch {
      toast.error("Error de red");
    } finally {
      setReprocessing(false);
    }
  }

  const cfg = detail ? (STATUS_CFG[detail.state] ?? STATUS_CFG.ignored) : null;
  const rpCfg = detail ? (REPROCESS_CFG[detail.state] ?? REPROCESS_CFG.ignored) : null;

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)]">
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-[var(--color-fg-subtle)]" />
        </div>
      )}

      {!loading && detail && cfg && rpCfg && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Fila 1 — subject + status + close (compacta) */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border)]">
            <h2 className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--color-fg)]">
              {detail.subject ?? (
                <span className="italic text-[var(--color-fg-mute)]">No subject</span>
              )}
            </h2>
            <StatusBadge state={detail.state} />
            <button
              type="button"
              onClick={onClose}
              className="size-5 grid place-items-center rounded text-[var(--color-fg-mute)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)] transition-colors"
              aria-label="Cerrar detalle"
            >
              <X size={12} />
            </button>
          </div>

          {/* Fila 2 — meta inline (From · To · fecha) */}
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 border-b border-[var(--color-border)] text-[10px] text-[var(--color-fg-subtle)] min-w-0">
            <span className="truncate min-w-0">
              <span className="opacity-70">De </span>
              <span className="text-[var(--color-fg-mute)] font-medium">
                {detail.from_name ?? detail.from_email}
              </span>
              {detail.from_name && (
                <span className="ml-1 opacity-70">&lt;{detail.from_email}&gt;</span>
              )}
            </span>
            {detail.recipients.length > 0 && (
              <>
                <span className="opacity-40 shrink-0">·</span>
                <span className="truncate min-w-0">
                  <span className="opacity-70">→ </span>
                  {detail.recipients.slice(0, 2).join(", ")}
                  {detail.recipients.length > 2 && ` +${detail.recipients.length - 2}`}
                </span>
              </>
            )}
            <span className="ml-auto shrink-0 tabular-nums">
              {new Date(detail.received_at).toLocaleString(locale, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Fila 3 — action bar fina + toggle HTML/Text inline */}
          <div
            className={cn(
              "shrink-0 flex items-center gap-2 px-3 py-1 border-b border-[var(--color-border)] min-w-0",
              rpCfg.primary
                ? "bg-amber-50 dark:bg-amber-950/30"
                : "bg-[var(--color-surface)]/40",
            )}
          >
            {rpCfg.note ? (
              <span className="truncate text-[10px] text-amber-700 dark:text-amber-400 min-w-0">
                ⚠ {rpCfg.note}
              </span>
            ) : (
              <span className="truncate text-[10px] text-[var(--color-fg-subtle)] min-w-0">
                Listo para reprocesar
              </span>
            )}
            <button
              type="button"
              onClick={reprocess}
              disabled={reprocessing}
              className="ml-auto shrink-0 inline-flex items-center gap-1 rounded bg-[var(--color-fg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-bg)] hover:opacity-80 disabled:opacity-50"
            >
              {reprocessing ? (
                <Loader2 size={9} className="animate-spin" />
              ) : (
                <RotateCcw size={9} />
              )}
              {reprocessing ? "Enviando…" : rpCfg.label}
            </button>
            {(detail.html_url || detail.text_url) && (
              <div className="flex shrink-0 gap-0.5 border-l border-[var(--color-border)] pl-2 ml-0.5">
                {detail.html_url && (
                  <button
                    type="button"
                    onClick={() => setView("html")}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
                      view === "html"
                        ? "bg-[var(--color-fg)] text-[var(--color-bg)]"
                        : "text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]",
                    )}
                  >
                    HTML
                  </button>
                )}
                {detail.text_url && (
                  <button
                    type="button"
                    onClick={() => setView("text")}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
                      view === "text"
                        ? "bg-[var(--color-fg)] text-[var(--color-bg)]"
                        : "text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]",
                    )}
                  >
                    Text
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 mx-3 mb-3 mt-2 rounded-xl border border-[var(--color-border)] overflow-y-auto overflow-x-hidden bg-white">
            {view === "html" && detail.html_url ? (
              htmlContent ? (
                <div
                  className="email-body-content px-5 py-4 text-[13px] leading-relaxed text-gray-900 [&_a]:text-blue-600 [&_img]:max-w-full [&_img]:h-auto [&_table]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-[var(--color-fg-mute)]" />
                </div>
              )
            ) : view === "text" && detail.text_url ? (
              textContent !== null ? (
                <pre className="px-5 py-4 text-[12px] leading-relaxed text-gray-900 whitespace-pre-wrap break-words font-mono">
                  {textContent}
                </pre>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-[var(--color-fg-mute)]" />
                </div>
              )
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-fg-mute)]">
                No body stored
              </div>
            )}
          </div>

          {detail.attachments.length > 0 && (
            <div className="shrink-0 px-3 pb-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-fg-subtle)] mb-1.5">
                {detail.attachments.length} Attachment
                {detail.attachments.length !== 1 ? "s" : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                {detail.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5"
                  >
                    <FileText size={11} className="text-rose-500 shrink-0" />
                    <span className="text-[11px] font-medium text-[var(--color-fg)] truncate max-w-[120px]">
                      {att.original_name}
                    </span>
                    <span className="text-[10px] text-[var(--color-fg-subtle)]">
                      {formatBytes(att.size_bytes)}
                    </span>
                    {att.document_id && (
                      <Link
                        href={`/review/${att.document_id}`}
                        className="text-[10px] font-medium text-blue-500 hover:underline flex items-center gap-0.5"
                      >
                        doc
                        <ArrowUpRight size={9} />
                      </Link>
                    )}
                    {att.download_url && !att.document_id && (
                      <a
                        href={att.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
                      >
                        ↓
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Drawer principal ───────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EmailInboundDrawer({ open, onOpenChange }: Props) {
  const [items, setItems] = useState<EmailListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  // Cargar items cuando se abre; vaciar al cerrar
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/inbound-emails", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { items: EmailListItem[] };
      })
      .then((body) => {
        if (!cancelled) setItems(body.items ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  function refresh() {
    setLoading(true);
    fetch("/api/inbound-emails", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { items: EmailListItem[] };
      })
      .then((body) => setItems(body.items ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  const filtered = useMemo(() => {
    const list = items ?? [];
    let out = filter === "all" ? list : list.filter((i) => i.state === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (i) =>
          i.subject?.toLowerCase().includes(q) ||
          i.fromEmail.toLowerCase().includes(q) ||
          (i.fromName?.toLowerCase().includes(q) ?? false),
      );
    }
    return out;
  }, [items, filter, query]);

  function handleReprocessed(id: string) {
    setItems((prev) =>
      prev ? prev.map((i) => (i.id === id ? { ...i, state: "processing" } : i)) : prev,
    );
  }

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-40 bg-transparent pointer-events-none" />
        <DrawerPrimitive.Content
          data-vaul-drawer-direction="bottom"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[70vh] flex-col rounded-t-2xl border-t border-[var(--color-border)] bg-[var(--color-surface)] outline-none"
        >
          {/* Handle visible para arrastrar — vaul detecta el gesto en cualquier parte del header */}
          <div className="mx-auto mt-1.5 mb-1 h-1 w-10 shrink-0 rounded-full bg-[var(--color-border)]" />

          {/* Header compacto del drawer */}
          <DrawerPrimitive.Title asChild>
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5">
              <Mail size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <h2 className="text-[15px] font-semibold leading-tight text-[var(--color-fg)]">
                Email Inbound
              </h2>
              <span className="text-[12px] font-medium text-[var(--color-fg-subtle)]">
                {items ? `· ${items.length}` : "· …"}
              </span>
              <Link
                href="/integrations/email-inbound"
                onClick={() => onOpenChange(false)}
                className="ml-auto inline-flex items-center gap-1 rounded text-[10px] font-medium text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] transition-colors"
              >
                Página completa
                <ExternalLink size={10} />
              </Link>
              <DrawerPrimitive.Close asChild>
                <button
                  type="button"
                  className="size-6 grid place-items-center rounded text-[var(--color-fg-mute)] hover:bg-[var(--color-bg)] hover:text-[var(--color-fg)] transition-colors"
                  aria-label="Cerrar drawer"
                >
                  <X size={13} />
                </button>
              </DrawerPrimitive.Close>
            </div>
          </DrawerPrimitive.Title>
          <DrawerPrimitive.Description className="sr-only">
            Lista de correos inbound recibidos
          </DrawerPrimitive.Description>

          {/* Body — master/detail horizontal */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* LEFT: lista */}
            <div
              className={cn(
                "flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/40 transition-all duration-200",
                selectedId ? "w-[340px] shrink-0" : "flex-1",
              )}
            >
              {/* Search + filtros */}
              <div className="shrink-0 space-y-2 px-3 py-2 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por remitente o asunto…"
                    className={cn(
                      "h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]",
                      "pl-8 pr-3 text-[12px] text-[var(--color-fg)] outline-none",
                      "placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)] transition-colors",
                    )}
                  />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors",
                        filter === f.key
                          ? "bg-[var(--color-fg)] text-[var(--color-bg)]"
                          : "text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface)]",
                      )}
                    >
                      {filter === f.key && f.dot && (
                        <span className={cn("size-1.5 rounded-full", f.dot)} />
                      )}
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rows */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {loading && !items ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 size={18} className="animate-spin text-[var(--color-fg-subtle)]" />
                  </div>
                ) : error ? (
                  <div className="px-4 py-8 text-center text-[11px] text-rose-500">
                    Error: {error}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Mail size={28} className="text-[var(--color-fg-subtle)]" />
                    <p className="text-[12px] text-[var(--color-fg-mute)]">
                      No hay correos
                    </p>
                  </div>
                ) : (
                  filtered.map((item) => (
                    <EmailRow
                      key={item.id}
                      item={item}
                      selected={item.id === selectedId}
                      onClick={() =>
                        setSelectedId((prev) => (prev === item.id ? null : item.id))
                      }
                    />
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg)]">
                <span className="text-[9px] text-[var(--color-fg-subtle)]">
                  {filtered.length} de {items?.length ?? 0} · últimos 200
                </span>
                <button
                  type="button"
                  onClick={refresh}
                  disabled={loading}
                  className="inline-flex items-center gap-1 text-[10px] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={9} className={loading ? "animate-spin" : undefined} />
                  Refrescar
                </button>
              </div>
            </div>

            {/* RIGHT: detalle */}
            {selectedId ? (
              <div className="flex-1 min-w-0 overflow-hidden">
                <DetailPanel
                  emailId={selectedId}
                  onClose={() => setSelectedId(null)}
                  onReprocessed={handleReprocessed}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[var(--color-surface)]/40">
                <div className="size-12 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center">
                  <Mail size={20} className="text-[var(--color-fg-subtle)]" />
                </div>
                <p className="text-[12px] text-[var(--color-fg-mute)]">
                  Seleccioná un correo para ver el detalle
                </p>
              </div>
            )}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
