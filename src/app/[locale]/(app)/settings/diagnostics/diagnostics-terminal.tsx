"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { DiagResult } from "@/app/api/diagnostics/route";

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS = {
  pass: { symbol: "✓", color: "#4ade80", bg: "#052e16", label: "PASS", badge: "#16a34a" },
  fail: { symbol: "✗", color: "#f87171", bg: "#450a0a", label: "FAIL", badge: "#dc2626" },
  warn: { symbol: "⚠", color: "#fbbf24", bg: "#422006", label: "WARN", badge: "#d97706" },
  skip: { symbol: "─", color: "#6b7280", bg: "#111827", label: "SKIP", badge: "#4b5563" },
} as const;

const CATEGORIES = [
  "RUNTIME", "ENV", "SUPABASE", "PIPELINE", "TENANT",
  "SEGURIDAD", "ANTHROPIC", "ODOO", "EDGE FUNCTIONS", "API", "STORAGE", "CRON",
] as const;

const CAT_COLOR: Record<string, string> = {
  RUNTIME: "#c084fc", ENV: "#818cf8", SUPABASE: "#34d399",
  PIPELINE: "#60a5fa", TENANT: "#f472b6", SEGURIDAD: "#fb923c",
  ANTHROPIC: "#d97706", ODOO: "#a78bfa", "EDGE FUNCTIONS": "#38bdf8",
  API: "#22d3ee", STORAGE: "#86efac", CRON: "#facc15",
};

const STORAGE_KEY = "sdm_diag_history";
const MAX_HISTORY = 10;

// ─── types ────────────────────────────────────────────────────────────────────

type RunState = "idle" | "running" | "done";
type Filter = "all" | "pass" | "fail" | "warn";
interface LogLine { ts: string; result: DiagResult; }
interface Run { id: string; startedAt: string; durationMs: number; lines: LogLine[]; summary: Summary; }
interface Summary { pass: number; fail: number; warn: number; total: number; }

// ─── helpers ──────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function loadHistory(): Run[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Run[]; } catch { return []; }
}
function saveHistory(runs: Run[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_HISTORY))); } catch { /* */ }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Line({ line }: { line: LogLine }) {
  const s = STATUS[line.result.status];
  return (
    <div className="flex gap-2 py-[1px] leading-relaxed">
      <span className="shrink-0 select-none text-[#484f58]">[{line.ts}]</span>
      <span className="w-[40px] shrink-0 font-bold" style={{ color: s.color }}>[{s.label}]</span>
      <span className="min-w-0 flex-1 break-words">
        <span className="text-[#e6edf3]">{line.result.label}</span>
        <span className="mx-1.5 text-[#484f58]">—</span>
        <span style={{ color: line.result.status === "pass" ? "#6e7681" : s.color }}>
          {line.result.message}
        </span>
        {line.result.ms != null && (
          <span className="ml-1.5 text-[#484f58]">({line.result.ms}ms)</span>
        )}
      </span>
    </div>
  );
}

function CatSection({ name, lines }: { name: string; lines: LogLine[] }) {
  const pass = lines.filter(l => l.result.status === "pass").length;
  const fail = lines.filter(l => l.result.status === "fail").length;
  const warn = lines.filter(l => l.result.status === "warn").length;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-bold tracking-[0.12em]" style={{ color: CAT_COLOR[name] ?? "#8b949e" }}>
          ▸ {name}
        </span>
        <span className="flex-1 border-t border-[#21262d]" />
        {pass > 0 && <span className="text-[10px] font-bold" style={{ color: STATUS.pass.color }}>✓{pass}</span>}
        {warn > 0 && <span className="text-[10px] font-bold" style={{ color: STATUS.warn.color }}>⚠{warn}</span>}
        {fail > 0 && <span className="text-[10px] font-bold" style={{ color: STATUS.fail.color }}>✗{fail}</span>}
      </div>
      {lines.map((l, i) => <Line key={i} line={l} />)}
    </div>
  );
}

function StatCard({ label, value, status }: { label: string; value: number; status: keyof typeof STATUS }) {
  const s = STATUS[status];
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border p-4 transition-colors"
      style={{ background: s.bg, borderColor: `${s.badge}40` }}
    >
      <span className="text-3xl font-bold tabular-nums" style={{ color: s.color }}>{value}</span>
      <span className="text-xs font-medium" style={{ color: s.color }}>{label}</span>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export function DiagnosticsTerminal() {
  const t = useTranslations("settings.diagnostics.terminal");
  const [state, setState] = useState<RunState>("idle");
  const [lines, setLines] = useState<LogLine[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [history, setHistory] = useState<Run[]>([]);
  const [viewingRun, setViewingRun] = useState<Run | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const terminalBodyRef = useRef<HTMLDivElement>(null);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setHistory(loadHistory()); }, []);

  // Scroll DENTRO del terminal — no mueve el page
  useEffect(() => {
    if (viewingRun === null && terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [lines, summary, viewingRun]);

  const run = useCallback(async () => {
    setLines([]); setSummary(null); setViewingRun(null); setFilter("all");
    setState("running");
    startRef.current = Date.now();
    timerRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    const accumulated: LogLine[] = [];
    try {
      const res = await fetch("/api/diagnostics", { method: "POST" });
      if (!res.body) throw new Error("No stream body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          try {
            const result = JSON.parse(part) as DiagResult;
            const line = { ts: ts(), result };
            accumulated.push(line);
            setLines(prev => [...prev, line]);
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      const line = { ts: ts(), result: { id: "network", category: "API", label: "NETWORK ERROR", status: "fail" as const, message: e instanceof Error ? e.message : String(e) } };
      accumulated.push(line);
      setLines(prev => [...prev, line]);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      const durationMs = Date.now() - startRef.current;
      setElapsed(durationMs);
      setState("done");
      const pass = accumulated.filter(l => l.result.status === "pass").length;
      const fail = accumulated.filter(l => l.result.status === "fail").length;
      const warn = accumulated.filter(l => l.result.status === "warn").length;
      const s = { pass, fail, warn, total: accumulated.length };
      setSummary(s);
      const newRun: Run = { id: Date.now().toString(), startedAt: new Date(startRef.current).toLocaleString("es"), durationMs, lines: accumulated, summary: s };
      setHistory(prev => { const next = [newRun, ...prev].slice(0, MAX_HISTORY); saveHistory(next); return next; });
    }
  }, []);

  const displayLines = viewingRun?.lines ?? lines;
  const displaySummary = viewingRun?.summary ?? summary;
  const filteredLines = filter === "all" ? displayLines : displayLines.filter(l => l.result.status === filter);
  const grouped = CATEGORIES.map(cat => ({ cat, lines: filteredLines.filter(l => l.result.category === cat) })).filter(g => g.lines.length > 0);
  const overallStatus = displaySummary ? (displaySummary.fail > 0 ? "fail" : displaySummary.warn > 0 ? "warn" : "pass") : null;

  function clearTerminal() { setLines([]); setSummary(null); setState("idle"); setViewingRun(null); }
  function clearHistory() { setHistory([]); localStorage.removeItem(STORAGE_KEY); }
  function copyLog() {
    const text = (viewingRun?.lines ?? lines).map(l =>
      `[${l.ts}] [${STATUS[l.result.status].label}] [${l.result.category}] ${l.result.label} — ${l.result.message}${l.result.ms != null ? ` (${l.result.ms}ms)` : ""}`
    ).join("\n");
    void navigator.clipboard.writeText(text);
  }

  return (
    <div className="w-full px-8 py-8">
    <div className="flex min-h-0 flex-col gap-0">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--color-fg)]">{t("title")}</h1>
        <p className="mt-0.5 text-sm text-[var(--color-fg-mute)]">
          {t("subtitle")} {displaySummary && <span className="font-medium text-[var(--color-fg)]">{displaySummary.total} {t("testsIn")} {(((viewingRun?.durationMs) ?? elapsed) / 1000).toFixed(2)}s.</span>}
        </p>
      </div>

      {/* Layout: terminal left + panel right */}
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">

        {/* ── LEFT: Terminal ── */}
        <div className="flex min-w-0 flex-col gap-4">

          {/* Summary stat cards */}
          {displaySummary ? (
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => setFilter(f => f === "pass" ? "all" : "pass")}>
                <StatCard label={t("statOperational")} value={displaySummary.pass} status="pass" />
              </button>
              <button onClick={() => setFilter(f => f === "fail" ? "all" : "fail")}>
                <StatCard label={t("statErrors")} value={displaySummary.fail} status="fail" />
              </button>
              <button onClick={() => setFilter(f => f === "warn" ? "all" : "warn")}>
                <StatCard label={t("statWarnings")} value={displaySummary.warn} status="warn" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {(["pass", "fail", "warn"] as const).map(s => (
                <div key={s} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
                  <span className="text-3xl font-bold tabular-nums text-[#484f58]">—</span>
                  <p className="mt-1 text-xs text-[#484f58]">{s === "pass" ? t("statOperational") : s === "fail" ? t("statErrors") : t("statWarnings")}</p>
                </div>
              ))}
            </div>
          )}

          {/* Terminal window */}
          <div className="overflow-hidden rounded-xl border border-[#30363d] bg-[#0d1117] shadow-2xl"
            style={{ fontFamily: "var(--font-mono, 'Geist Mono', monospace)", fontSize: "11.5px" }}>

            {/* Title bar */}
            <div className="flex items-center gap-2 border-b border-[#30363d] bg-[#161b22] px-4 py-2.5">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 flex-1 text-center text-[11px] text-[#6e7681]">
                {viewingRun ? `docflow — diagnostics — ${viewingRun.startedAt}` : "docflow — diagnostics — live"}
              </span>
              {state === "running" && (
                <span className="text-[11px] text-[#6e7681]">{(elapsed / 1000).toFixed(1)}s</span>
              )}
              {overallStatus && (
                <span className="text-[11px] font-bold" style={{ color: STATUS[overallStatus].color }}>
                  {STATUS[overallStatus].symbol} {overallStatus.toUpperCase()}
                </span>
              )}
            </div>

            {/* Body */}
            <div ref={terminalBodyRef} className="h-[600px] overflow-y-auto p-4 leading-relaxed">
              <div>
                <span className="text-[#58a6ff]">docflow</span>
                <span className="text-[#8b949e]">@diagnostics:~$ </span>
                <span className="text-[#e6edf3]">
                  {viewingRun ? `show-run --id ${viewingRun.id}` : "run-diagnostics --all --stream"}
                </span>
              </div>

              {state === "idle" && !viewingRun && (
                <div className="mt-2 text-[#6e7681]">
                  {t("idle")}
                  <span className="ml-1 animate-pulse">█</span>
                </div>
              )}

              {grouped.map(({ cat, lines: cl }) => (
                <CatSection key={cat} name={cat} lines={cl} />
              ))}

              {state === "running" && (
                <div className="mt-2 flex gap-2">
                  <span className="text-[#484f58]">[{ts()}]</span>
                  <span className="animate-pulse" style={{ color: CAT_COLOR["ENV"] }}>[ RUN ]</span>
                  <span className="text-[#6e7681]">{t("executing")}</span>
                </div>
              )}

              {displaySummary && (
                <div className="mt-4 border-t border-[#21262d] pt-3">
                  <div className="flex flex-wrap gap-4 font-semibold">
                    <span style={{ color: "#4ade80" }}>✓ {displaySummary.pass} passed</span>
                    {displaySummary.warn > 0 && <span style={{ color: "#fbbf24" }}>⚠ {displaySummary.warn} warnings</span>}
                    {displaySummary.fail > 0 && <span style={{ color: "#f87171" }}>✗ {displaySummary.fail} failed</span>}
                    <span className="text-[#484f58]">{t("testsIn")} {(((viewingRun?.durationMs) ?? elapsed) / 1000).toFixed(2)}s</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-[#58a6ff]">docflow</span>
                    <span className="text-[#8b949e]">@diagnostics:~$ </span>
                    <span className="animate-pulse text-[#6e7681]">█</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={run} disabled={state === "running"}
              className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-4 text-sm font-medium text-[var(--color-bg)] transition-opacity disabled:opacity-50"
            >
              {state === "running"
                ? <><span className="size-3.5 animate-spin rounded-full border-2 border-[var(--color-bg)] border-t-transparent" />{t("running")}</>
                : <><span>▶</span>{state === "done" ? t("rerun") : t("run")}</>}
            </button>
            <button onClick={clearTerminal} disabled={state === "running"}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-fg-mute)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-40">
              ✕ {t("clear")}
            </button>
            {displayLines.length > 0 && (
              <button onClick={copyLog}
                className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-fg-mute)] transition-colors hover:text-[var(--color-fg)]">
                ⎘ {t("copyLog")}
              </button>
            )}
            {displaySummary && (
              <div className="ml-auto flex items-center gap-1 rounded-lg border border-[#30363d] bg-[#0d1117] p-1">
                {(["all", "fail", "warn", "pass"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className="rounded px-2.5 py-1 text-[11px] font-medium transition-all"
                    style={{
                      background: filter === f ? (f === "all" ? "#21262d" : STATUS[f as keyof typeof STATUS]?.bg ?? "#21262d") : "transparent",
                      color: f === "all" ? (filter === "all" ? "#e6edf3" : "#6e7681") : STATUS[f as keyof typeof STATUS]?.color,
                    }}>
                    {f === "all" ? t("filterAll") : f === "fail" ? t("filterErrors") : f === "warn" ? t("filterWarn") : t("filterOk")}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Panel ── */}
        <div className="flex flex-col gap-4">

          {/* Category health grid */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                {t("categoryStatus")}
              </h2>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {displaySummary ? (
                CATEGORIES.map(cat => {
                  const catLines = displayLines.filter(l => l.result.category === cat);
                  if (catLines.length === 0) return null;
                  const fail = catLines.filter(l => l.result.status === "fail").length;
                  const warn = catLines.filter(l => l.result.status === "warn").length;
                  const s = fail > 0 ? "fail" : warn > 0 ? "warn" : "pass";
                  return (
                    <div key={cat} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-[11px] font-bold" style={{ color: STATUS[s].color }}>
                        {STATUS[s].symbol}
                      </span>
                      <span className="flex-1 text-xs font-medium text-[var(--color-fg)]" style={{ color: CAT_COLOR[cat] }}>
                        {cat}
                      </span>
                      <span className="text-[11px] text-[var(--color-fg-subtle)]">
                        {catLines.filter(l => l.result.status === "pass").length}/{catLines.length}
                      </span>
                    </div>
                  );
                })
              ) : (
                CATEGORIES.map(cat => (
                  <div key={cat} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[11px] text-[var(--color-fg-subtle)]">─</span>
                    <span className="flex-1 text-xs font-medium" style={{ color: CAT_COLOR[cat] }}>{cat}</span>
                    <span className="text-[11px] text-[var(--color-fg-subtle)]">—</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Run history */}
          {history.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  {t("history")}
                </h2>
                <button onClick={clearHistory} className="text-[11px] text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg-mute)]">
                  {t("clearHistory")}
                </button>
              </div>
              <div className="divide-y divide-[var(--color-border)]" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "11px" }}>
                {history.map((histRun, i) => {
                  const s = histRun.summary.fail > 0 ? "fail" : histRun.summary.warn > 0 ? "warn" : "pass";
                  const isViewing = viewingRun?.id === histRun.id;
                  return (
                    <button key={histRun.id} onClick={() => setViewingRun(isViewing ? null : histRun)}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-mute)]"
                      style={{ background: isViewing ? "var(--color-surface-mute)" : undefined }}>
                      <span style={{ color: STATUS[s].color }}>{STATUS[s].symbol}</span>
                      <span className="flex-1 truncate text-[var(--color-fg-mute)]">{histRun.startedAt}</span>
                      <span className="flex shrink-0 gap-1.5">
                        <span style={{ color: STATUS.pass.color }}>✓{histRun.summary.pass}</span>
                        {histRun.summary.warn > 0 && <span style={{ color: STATUS.warn.color }}>⚠{histRun.summary.warn}</span>}
                        {histRun.summary.fail > 0 && <span style={{ color: STATUS.fail.color }}>✗{histRun.summary.fail}</span>}
                      </span>
                      {i === 0 && !isViewing && (
                        <span className="rounded bg-[var(--color-surface)] px-1 py-0.5 text-[9px] text-[var(--color-fg-subtle)]">{t("latest")}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">{t("legend")}</h2>
            {(["pass", "fail", "warn"] as const).map(s => (
              <div key={s} className="flex items-center gap-2 text-xs">
                <span className="w-4 font-bold" style={{ color: STATUS[s].color }}>{STATUS[s].symbol}</span>
                <span className="text-[var(--color-fg-mute)]">
                  {s === "pass"
                    ? `${t("passLabel")} — ${t("passDesc")}`
                    : s === "fail"
                      ? `${t("failLabel")} — ${t("failDesc")}`
                      : `${t("warnLabel")} — ${t("warnDesc")}`
                  }
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
