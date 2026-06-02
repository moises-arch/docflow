"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Globe,
  Loader2,
  Mail,
  PlayCircle,
  Server,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import type { CleoSmokeRun } from "./cleo-dashboard-client";

type Stats = {
  total: number;
  downloaded: number;
  pending: number;
  failed: number;
  last_downloaded_at: string | null;
};

type LogLine = { level: "info" | "ok" | "warn" | "error"; msg: string; t: string };

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "ok" | "warn" | "error" | "neutral";
}) {
  const colors = {
    ok: "text-emerald-700 dark:text-emerald-400",
    warn: "text-amber-700 dark:text-amber-400",
    error: "text-red-700 dark:text-red-400",
    neutral: "text-[var(--color-fg)]",
  };
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-mute)]">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${colors[tone]}`}>{value}</div>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block size-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
      aria-label={ok ? "OK" : "Error"}
    />
  );
}

function CleoTerminal({ lines, running }: { lines: LogLine[]; running: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  const colors: Record<LogLine["level"], string> = {
    info: "text-slate-300",
    ok: "text-emerald-400",
    warn: "text-amber-400",
    error: "text-red-400",
  };

  return (
    <div
      ref={ref}
      className="h-64 overflow-y-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-relaxed"
    >
      {lines.length === 0 && (
        <span className="text-slate-500">{running ? "Iniciando..." : "Sin logs aún."}</span>
      )}
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2">
          <span className="shrink-0 text-slate-600">{l.t}</span>
          <span className={colors[l.level]}>{l.msg}</span>
        </div>
      ))}
      {running && (
        <div className="mt-1 flex items-center gap-1 text-slate-500">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-slate-500" />
          procesando...
        </div>
      )}
    </div>
  );
}

export function CleoResumenClient({
  stats,
  smokeRuns,
}: {
  stats: Stats;
  smokeRuns: CleoSmokeRun[];
}) {
  const router = useRouter();
  const [smokeRunning, setSmokeRunning] = useState(false);
  const [smokeResult, setSmokeResult] = useState<CleoSmokeRun | null>(smokeRuns[0] ?? null);
  const [scanning, setScanning] = useState(false);
  const [scanningPortal, setScanningPortal] = useState(false);
  const [terminalLines, setTerminalLines] = useState<LogLine[]>([]);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);

  const smokeFailed = smokeResult && !smokeResult.ok;

  async function runSmoke() {
    if (smokeRunning) return;
    setSmokeRunning(true);
    try {
      const r = await fetch("/api/ingest/cleo/smoke", { method: "POST" });
      const body = (await r.json().catch(() => null)) as
        | { ok: boolean; ran_at: string; checks: CleoSmokeRun["checks"] }
        | null;
      if (!body) { toast.error("Smoke test devolvió respuesta vacía"); return; }
      setSmokeResult({ id: "live", ok: body.ok, checks: body.checks, created_at: body.ran_at });
      if (body.ok) toast.success("Smoke test OK — todo verde");
      else toast.error(`Smoke test detectó ${body.checks.filter((c) => !c.ok).length} falla(s)`);
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "fallo desconocido"}`);
    } finally {
      setSmokeRunning(false);
    }
  }

  async function procesarPendientes() {
    if (scanning) return;
    setScanning(true);
    setTerminalLines([]);
    setShowTerminal(true);
    setTerminalRunning(true);
    try {
      const res = await fetch("/api/ingest/cleo/scan-stream", { method: "POST" });
      if (!res.ok || !res.body) { toast.error(`Scan falló (HTTP ${res.status})`); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as
              | { level: LogLine["level"]; msg: string; t: string }
              | { done: true; result?: { dispatched?: number; archived?: number; cleo_detected?: number } }
              | { error: string };
            if ("done" in data && data.done) {
              if ("result" in data && data.result) {
                const r = data.result;
                if ((r.cleo_detected ?? 0) === 0) toast.success("No se encontraron notificaciones Supplier Portal pendientes");
                else toast.success(`${r.dispatched} orden(es) procesadas, ${r.archived} archivadas`);
              }
              setTimeout(() => router.refresh(), 1500);
              break;
            }
            if ("level" in data) setTerminalLines((prev) => [...prev, data]);
          } catch { /* ignore invalid JSON */ }
        }
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "fallo"}`);
    } finally {
      setScanning(false);
      setTerminalRunning(false);
    }
  }

  async function escanearPortal() {
    if (scanningPortal) return;
    setScanningPortal(true);
    setTerminalLines([]);
    setShowTerminal(true);
    setTerminalRunning(true);
    try {
      const res = await fetch("/api/ingest/cleo/portal-scan-stream", { method: "POST" });
      if (!res.ok || !res.body) { toast.error(`Portal scan falló (HTTP ${res.status})`); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as
              | { level: LogLine["level"]; msg: string; t: string }
              | { done: true; result?: { found?: number; dispatched?: number; skipped?: number; errors?: string[] } }
              | { error: string };
            if ("done" in data && data.done) {
              if ("result" in data && data.result) {
                const r = data.result;
                if ((r.found ?? 0) === 0) toast.success("No hay órdenes 850 nuevas en el portal Supplier Portal");
                else toast.success(`${r.dispatched} orden(es) descargadas del portal (${r.skipped} omitidas)`);
              }
              setTimeout(() => router.refresh(), 1500);
              break;
            }
            if ("level" in data) setTerminalLines((prev) => [...prev, data]);
          } catch { /* ignore invalid JSON */ }
        }
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "fallo"}`);
    } finally {
      setScanningPortal(false);
      setTerminalRunning(false);
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Image src="/connector-logo.svg" alt="Supplier Portal" width={120} height={36} className="h-9 w-auto" />
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Integración activa
          </span>
        </div>
        <p className="mt-1.5 text-sm text-[var(--color-fg-mute)]">
          Resumen general y estado de la integración Supplier Portal
        </p>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Alert si smoke falló */}
        {smokeFailed && (
          <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">Smoke test detectó problemas en la integración</div>
              <ul className="mt-1 list-inside list-disc text-xs">
                {smokeResult!.checks.filter((c) => !c.ok).map((c) => (
                  <li key={c.name}><code>{c.name}</code> — {c.detail}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={<Download size={14} />} label="Descargados" value={stats.downloaded.toString()} tone="ok" />
          <StatCard icon={<Clock size={14} />} label="En curso" value={stats.pending.toString()} tone={stats.pending > 0 ? "warn" : "neutral"} />
          <StatCard icon={<AlertTriangle size={14} />} label="Fallidos" value={stats.failed.toString()} tone={stats.failed > 0 ? "error" : "neutral"} />
          <StatCard
            icon={<Zap size={14} />}
            label="Último download"
            value={stats.last_downloaded_at
              ? new Date(stats.last_downloaded_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })
              : "—"}
            tone="neutral"
          />
        </div>

        {/* Salud + herramientas */}
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-[var(--color-fg-mute)]" />
              <h2 className="text-sm font-semibold">Salud de la integración</h2>
              {smokeResult && <StatusDot ok={smokeResult.ok} />}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={procesarPendientes} disabled={scanning || scanningPortal}>
                {scanning ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Mail size={14} className="mr-1" />}
                Procesar pendientes
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={escanearPortal} disabled={scanning || scanningPortal}>
                {scanningPortal ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Globe size={14} className="mr-1" />}
                Escanear portal Supplier Portal
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={runSmoke} disabled={smokeRunning}>
                {smokeRunning ? <Loader2 size={14} className="mr-1 animate-spin" /> : <PlayCircle size={14} className="mr-1" />}
                Smoke test
              </Button>
            </div>
          </div>
          {smokeResult ? (
            <div className="grid gap-1.5">
              <div className="text-xs text-[var(--color-fg-mute)]">
                Última corrida:{" "}
                {new Date(smokeResult.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "medium" })}
              </div>
              <ul className="grid gap-1">
                {smokeResult.checks.map((c) => (
                  <li key={c.name} className="flex items-center justify-between rounded-sm border bg-background px-3 py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      {c.ok ? <CheckCircle2 size={12} className="text-emerald-600" /> : <AlertTriangle size={12} className="text-red-600" />}
                      <code className="font-mono">{c.name}</code>
                    </div>
                    <span className={`text-[10px] ${c.ok ? "text-[var(--color-fg-mute)]" : "text-red-600"}`}>
                      {c.detail}{typeof c.ms === "number" && ` · ${c.ms}ms`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-xs text-[var(--color-fg-mute)]">
              No se ha corrido smoke test todavía. Click <em>Smoke test</em> para verificar.
            </div>
          )}
        </div>

        {/* Terminal de logs */}
        {showTerminal && (
          <div className="rounded-md border border-slate-800 bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
              <div className="flex items-center gap-2">
                <Terminal size={13} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-300">Logs del proceso</span>
                {terminalRunning && <Loader2 size={11} className="animate-spin text-slate-500" />}
              </div>
              <button type="button" onClick={() => setShowTerminal(false)} className="text-slate-500 hover:text-slate-300">
                <X size={13} />
              </button>
            </div>
            <div className="p-2">
              <CleoTerminal lines={terminalLines} running={terminalRunning} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
