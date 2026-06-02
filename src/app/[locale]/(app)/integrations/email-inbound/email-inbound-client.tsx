"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import {
  AlertCircle, ArrowUpRight, CheckCircle2, ChevronRight,
  Clock3, FileText, Loader2, Mail, MinusCircle,
  RefreshCw, RotateCcw, Search, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type EmailListItem = {
  id: string;
  subject: string | null;
  fromEmail: string;
  fromName: string | null;
  receivedAt: string;
  state: string;
  adapter: string | null;
  hasHtml: boolean;
  hasText: boolean;
};

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
  "bg-violet-500", "bg-blue-500", "bg-cyan-500", "bg-teal-500",
  "bg-emerald-500", "bg-amber-500", "bg-orange-500", "bg-rose-500", "bg-pink-500", "bg-indigo-500",
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

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  label: string;
  icon: React.ElementType;
  dot: string;
  badge: string;
  kpi: string;
  bar: string;
}> = {
  processed:  { label: "Processed",  icon: CheckCircle2, dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",  kpi: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  processing: { label: "Processing", icon: Clock3,       dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900",      kpi: "text-amber-600 dark:text-amber-400",   bar: "bg-amber-500"   },
  failed:     { label: "Failed",     icon: AlertCircle,  dot: "bg-rose-500",    badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900",          kpi: "text-rose-600 dark:text-rose-400",     bar: "bg-rose-500"    },
  ignored:    { label: "Ignored",    icon: MinusCircle,  dot: "bg-slate-300 dark:bg-slate-600", badge: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700", kpi: "text-slate-500 dark:text-slate-400", bar: "bg-slate-300 dark:bg-slate-600" },
};

// ── Avatar ─────────────────────────────────────────────────────────────────

function SenderAvatar({ name, email, sm }: { name: string | null; email: string; sm?: boolean }) {
  const sz = sm ? "size-6 text-[9px]" : "size-7 text-[10px]";
  return (
    <div className={cn(sz, domainColor(email), "rounded-full flex items-center justify-center text-white font-bold shrink-0")}>
      {initials(name, email)}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ state }: { state: string }) {
  const cfg = STATUS_CFG[state] ?? STATUS_CFG.ignored;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold whitespace-nowrap", cfg.badge)}>
      <Icon size={9} />
      {cfg.label}
    </span>
  );
}

// ── KPI Strip ──────────────────────────────────────────────────────────────

function KpiStrip({ items }: { items: EmailListItem[] }) {
  const counts = useMemo(() => ({
    total:      items.length,
    processed:  items.filter(e => e.state === "processed").length,
    processing: items.filter(e => e.state === "processing").length,
    failed:     items.filter(e => e.state === "failed").length,
    ignored:    items.filter(e => e.state === "ignored").length,
  }), [items]);

  const stats = [
    { label: "Total",      value: counts.total,      icon: Mail,         cls: "text-[var(--color-fg)]",                  bar: "bg-[var(--color-border)]"   },
    { label: "Processed",  value: counts.processed,  icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400",  bar: "bg-emerald-500"             },
    { label: "Processing", value: counts.processing, icon: Clock3,       cls: "text-amber-600 dark:text-amber-400",      bar: "bg-amber-500"               },
    { label: "Failed",     value: counts.failed,     icon: AlertCircle,  cls: "text-rose-600 dark:text-rose-400",        bar: "bg-rose-500"                },
    { label: "Ignored",    value: counts.ignored,    icon: MinusCircle,  cls: "text-[var(--color-fg-mute)]",             bar: "bg-[var(--color-border)]"   },
  ];

  return (
    <div className="flex shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
      {stats.map((s, i) => {
        const Icon = s.icon;
        const pct = counts.total > 0 ? Math.round((s.value / counts.total) * 100) : 0;
        return (
          <div key={s.label} className={cn("flex-1 px-3 py-2.5 flex flex-col gap-0.5 min-w-0", i < stats.length - 1 && "border-r border-[var(--color-border)]")}>
            <div className="flex items-center gap-1">
              <Icon size={10} className={s.cls} />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--color-fg-subtle)]">{s.label}</span>
            </div>
            <span className={cn("text-xl font-bold tabular-nums leading-none", s.cls)}>{s.value}</span>
            <div className="h-[3px] rounded-full bg-[var(--color-border)] mt-0.5 overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", s.bar)}
                   style={{ width: s.label === "Total" ? "100%" : `${pct}%`, minWidth: s.value > 0 ? "4px" : "0" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Email row ──────────────────────────────────────────────────────────────

function EmailRow({ item, selected, onClick }: {
  item: EmailListItem; selected: boolean; onClick: () => void;
}) {
  const cfg = STATUS_CFG[item.state] ?? STATUS_CFG.ignored;
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "group w-full text-left px-3 py-2.5 border-b border-[var(--color-border)] flex items-start gap-2.5 transition-colors duration-100",
        selected ? "bg-[var(--color-bg)]" : "hover:bg-[var(--color-bg)]/60",
      )}>
      {/* Avatar + state dot */}
      <div className="flex flex-col items-center gap-1.5 pt-0.5">
        <SenderAvatar name={item.fromName} email={item.fromEmail} />
        <span className={cn("size-1.5 rounded-full", cfg.dot)} />
      </div>
      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1 mb-0.5">
          <span className="text-[12px] font-semibold text-[var(--color-fg)] truncate">
            {item.fromName ?? item.fromEmail.split("@")[0]}
          </span>
          <span className="text-[9px] text-[var(--color-fg-subtle)] tabular-nums shrink-0">{relTime(item.receivedAt)}</span>
        </div>
        <div className="text-[11px] font-medium text-[var(--color-fg-mute)] truncate mb-0.5">
          {item.subject ?? <span className="italic opacity-60">No subject</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-[var(--color-fg-subtle)] truncate">@{item.fromEmail.split("@")[1]}</span>
          <StatusBadge state={item.state} />
        </div>
      </div>
      <ChevronRight size={11} className={cn("shrink-0 mt-1 text-[var(--color-fg-subtle)] transition-opacity", selected ? "opacity-100" : "opacity-0 group-hover:opacity-60")} />
    </button>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────

type EmailDetail = {
  id: string; from_email: string; from_name: string | null;
  subject: string | null; received_at: string; state: string;
  adapter: string | null; recipients: string[];
  html_url: string | null; text_url: string | null;
  attachments: Array<{ id: string; original_name: string; mime_type: string; size_bytes: number; state: string; document_id: string | null; download_url: string | null }>;
};

const REPROCESS_CFG: Record<string, { label: string; primary: boolean; note: string | null }> = {
  processed:  { label: "Re-procesar",        primary: false, note: "Este email ya fue procesado. Re-procesarlo puede crear documentos duplicados." },
  failed:     { label: "Enviar al pipeline", primary: true,  note: null },
  ignored:    { label: "Enviar al pipeline", primary: true,  note: "Email ignorado — sin adjuntos válidos o sin proveedor detectado." },
  processing: { label: "Forzar re-proceso",  primary: false, note: "Solo forzar si lleva más de 15 min sin avanzar." },
};

function DetailPanel({ emailId, onClose, onReprocessed }: {
  emailId: string; onClose: () => void; onReprocessed: (id: string) => void;
}) {
  const locale = useLocale();
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [view, setView] = useState<"html" | "text">("html");
  const [reprocessing, setReprocessing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setDetail(null); setHtmlContent(null);
    fetch(`/api/inbound-emails/${emailId}`)
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return (await r.json()) as EmailDetail; })
      .then(d => { if (!active) return; setDetail(d); setView(d.html_url ? "html" : "text"); if (d.html_url) fetch(d.html_url).then(r=>r.text()).then(html=>{ if(active) setHtmlContent(html); }).catch(()=>{}); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [emailId]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || view !== "html" || !htmlContent) return;
    const doc = iframe.contentDocument;
    if (doc) { doc.open(); doc.write(`<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0}body{padding:20px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:13px;color:#1f2937;background:#fff;line-height:1.5}a{color:#2563eb}img{max-width:100%;height:auto}</style></head><body>${htmlContent}</body></html>`); doc.close(); }
  }, [htmlContent, view]);

  async function reprocess() {
    if (reprocessing) return;
    setReprocessing(true);
    try {
      const res = await fetch(`/api/inbound-emails/${emailId}/reprocess`, { method: "POST" });
      const body = (await res.json()) as { ok?: boolean; reprocessed?: number };
      if (res.ok && body.ok) {
        toast.success(`Re-procesando ${body.reprocessed} documento(s)`);
        onReprocessed(emailId); onClose();
      } else toast.error("No se pudo re-procesar el email");
    } catch { toast.error("Error de red"); }
    finally { setReprocessing(false); }
  }

  const cfg = detail ? (STATUS_CFG[detail.state] ?? STATUS_CFG.ignored) : null;
  const rpCfg = detail ? (REPROCESS_CFG[detail.state] ?? REPROCESS_CFG.ignored) : null;

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--color-fg-subtle)]">Email Detail</span>
        <button type="button" onClick={onClose} className="size-6 grid place-items-center rounded text-[var(--color-fg-mute)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)] transition-colors">
          <X size={13} />
        </button>
      </div>

      {loading && <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-[var(--color-fg-subtle)]" /></div>}

      {!loading && detail && cfg && rpCfg && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Subject + meta */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--color-border)] space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[13px] font-semibold text-[var(--color-fg)] leading-snug">
                {detail.subject ?? <span className="italic text-[var(--color-fg-mute)]">No subject</span>}
              </h2>
              <StatusBadge state={detail.state} />
            </div>
            {/* From / To chips */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full pl-1 pr-2.5 py-1">
                <SenderAvatar name={detail.from_name} email={detail.from_email} sm />
                <div className="min-w-0">
                  <div className="text-[9px] text-[var(--color-fg-subtle)] leading-none">From</div>
                  <div className="text-[10px] font-medium text-[var(--color-fg)] truncate max-w-[180px]">
                    {detail.from_name ?? detail.from_email}
                    {detail.from_name && <span className="text-[var(--color-fg-subtle)] font-normal ml-1">&lt;{detail.from_email}&gt;</span>}
                  </div>
                </div>
              </div>
              {detail.recipients.length > 0 && (
                <div className="flex items-center gap-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-2.5 py-1">
                  <div className="size-4 rounded-full bg-[var(--color-border)] flex items-center justify-center shrink-0">
                    <Mail size={8} className="text-[var(--color-fg-mute)]" />
                  </div>
                  <div>
                    <div className="text-[9px] text-[var(--color-fg-subtle)] leading-none">To</div>
                    <div className="text-[10px] font-medium text-[var(--color-fg-mute)] truncate max-w-[180px]">
                      {detail.recipients.slice(0, 2).join(", ")}
                      {detail.recipients.length > 2 && ` +${detail.recipients.length - 2}`}
                    </div>
                  </div>
                </div>
              )}
              <div className="ml-auto text-[9px] text-[var(--color-fg-subtle)] self-center tabular-nums">
                {new Date(detail.received_at).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>

          {/* AI action bar */}
          <div className={cn(
            "shrink-0 mx-3 mt-3 rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-3",
            rpCfg.primary
              ? "bg-[var(--color-fg)] border-[var(--color-fg)] text-[var(--color-bg)]"
              : "bg-[var(--color-surface)] border-[var(--color-border)]",
          )}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={cn("text-[11px] font-semibold", rpCfg.primary ? "text-[var(--color-bg)]" : "text-[var(--color-fg)]")}>
                  Pipeline de AI
                </span>
                <span className={cn("inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border", cfg.badge)}>
                  <cfg.icon size={8} />{cfg.label}
                </span>
              </div>
              {rpCfg.note && (
                <p className={cn("text-[10px] leading-tight", rpCfg.primary ? "opacity-60" : "text-amber-700 dark:text-amber-400")}>
                  {!rpCfg.primary && "⚠ "}{rpCfg.note}
                </p>
              )}
            </div>
            <button type="button" onClick={reprocess} disabled={reprocessing}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50",
                rpCfg.primary
                  ? "bg-[var(--color-bg)] text-[var(--color-fg)] hover:opacity-90"
                  : "bg-[var(--color-fg)] text-[var(--color-bg)] hover:opacity-80",
              )}>
              {reprocessing ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
              {reprocessing ? "Enviando…" : rpCfg.label}
            </button>
          </div>

          {/* View toggle */}
          {(detail.html_url || detail.text_url) && (
            <div className="shrink-0 flex gap-1 px-4 pt-2.5 pb-1">
              {detail.html_url && (
                <button type="button" onClick={() => setView("html")}
                  className={cn("px-2.5 py-1 rounded text-[11px] font-medium transition-colors", view === "html" ? "bg-[var(--color-fg)] text-[var(--color-bg)]" : "text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]")}>
                  HTML
                </button>
              )}
              {detail.text_url && (
                <button type="button" onClick={() => setView("text")}
                  className={cn("px-2.5 py-1 rounded text-[11px] font-medium transition-colors", view === "text" ? "bg-[var(--color-fg)] text-[var(--color-bg)]" : "text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]")}>
                  Text
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 min-h-0 mx-3 mb-3 mt-1.5 rounded-xl border border-[var(--color-border)] overflow-hidden">
            {view === "html" && detail.html_url ? (
              htmlContent
                ? <iframe ref={iframeRef} sandbox="allow-same-origin" title="email-body" className="h-full w-full border-0" />
                : <div className="flex h-full items-center justify-center"><Loader2 size={16} className="animate-spin text-[var(--color-fg-mute)]" /></div>
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-fg-mute)]">No body stored</div>
            )}
          </div>

          {/* Attachments */}
          {detail.attachments.length > 0 && (
            <div className="shrink-0 px-3 pb-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-fg-subtle)] mb-1.5">
                {detail.attachments.length} Attachment{detail.attachments.length !== 1 ? "s" : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                {detail.attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5">
                    <FileText size={11} className="text-rose-500 shrink-0" />
                    <span className="text-[11px] font-medium text-[var(--color-fg)] truncate max-w-[120px]">{att.original_name}</span>
                    <span className="text-[10px] text-[var(--color-fg-subtle)]">{formatBytes(att.size_bytes)}</span>
                    {att.document_id && (
                      <a href={`/review/${att.document_id}`} className="text-[10px] font-medium text-blue-500 hover:underline flex items-center gap-0.5">
                        doc<ArrowUpRight size={9} />
                      </a>
                    )}
                    {att.download_url && !att.document_id && (
                      <a href={att.download_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]">↓</a>
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

// ── Filters & main ─────────────────────────────────────────────────────────

type FilterKey = "all" | "processed" | "processing" | "failed" | "ignored";

const FILTERS: { key: FilterKey; label: string; dot?: string }[] = [
  { key: "all",        label: "All" },
  { key: "processed",  label: "Processed",  dot: "bg-emerald-500" },
  { key: "processing", label: "Processing", dot: "bg-amber-500"   },
  { key: "failed",     label: "Failed",     dot: "bg-rose-500"    },
  { key: "ignored",    label: "Ignored",    dot: "bg-slate-400"   },
];

export function EmailInboundClient({ items: initialItems }: { items: EmailListItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    let list = filter === "all" ? items : items.filter(i => i.state === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(i =>
        i.subject?.toLowerCase().includes(q) ||
        i.fromEmail.toLowerCase().includes(q) ||
        (i.fromName?.toLowerCase().includes(q) ?? false)
      );
    }
    return list;
  }, [items, filter, query]);

  function handleReprocessed(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, state: "processing" } : i));
  }

  return (
    <div className="flex h-full overflow-hidden bg-[var(--color-bg)]">
      {/* ── LEFT: log list ── */}
      <div className={cn(
        "flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/40 transition-all duration-200",
        selectedId ? "w-[340px] shrink-0" : "flex-1",
      )}>
        {/* KPI strip */}
        <KpiStrip items={items} />

        {/* Search + filters */}
        <div className="shrink-0 space-y-2 px-3 py-2 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search by sender, subject…"
              className={cn(
                "h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]",
                "pl-8 pr-3 text-[12px] text-[var(--color-fg)] outline-none",
                "placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)] transition-colors",
              )}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map(f => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors",
                  filter === f.key ? "bg-[var(--color-fg)] text-[var(--color-bg)]" : "text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface)]",
                )}>
                {filter === f.key && f.dot && <span className={cn("size-1.5 rounded-full", f.dot)} />}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Mail size={28} className="text-[var(--color-fg-subtle)]" />
              <p className="text-[12px] text-[var(--color-fg-mute)]">No emails found</p>
            </div>
          ) : filtered.map(item => (
            <EmailRow key={item.id} item={item} selected={item.id === selectedId}
              onClick={() => setSelectedId(prev => prev === item.id ? null : item.id)} />
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg)]">
          <span className="text-[9px] text-[var(--color-fg-subtle)]">
            {filtered.length} of {items.length} emails · last 200
          </span>
          <button type="button" className="inline-flex items-center gap-1 text-[10px] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] transition-colors">
            <RefreshCw size={9} />Refresh
          </button>
        </div>
      </div>

      {/* ── RIGHT: detail ── */}
      {selectedId ? (
        <div className="flex-1 min-w-0 overflow-hidden border-l border-[var(--color-border)]">
          <DetailPanel emailId={selectedId} onClose={() => setSelectedId(null)} onReprocessed={handleReprocessed} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[var(--color-surface)]/40">
          <div className="size-12 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center">
            <Mail size={20} className="text-[var(--color-fg-subtle)]" />
          </div>
          <p className="text-[12px] text-[var(--color-fg-mute)]">Select an email to view details</p>
        </div>
      )}
    </div>
  );
}
