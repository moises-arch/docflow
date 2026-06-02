"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { EmailViewerDrawer } from "@/components/app/email-viewer-drawer";
import {
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { CronCountdown } from "@/components/app/cron-countdown";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import type { CleoOrderRow } from "../cleo-dashboard-client";

const PORTAL_URL = "https://portal.example.com/webedi/view/home";

type LogLine = { level: "info" | "ok" | "warn" | "error"; msg: string; t: string };

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
        <span className="text-slate-500">
          {running ? "Iniciando..." : "Sin logs aún."}
        </span>
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

function StateBadge({ state }: { state: CleoOrderRow["state"] }) {
  const config = {
    pending: { cls: "bg-slate-500/10 text-slate-700 dark:text-slate-400", label: "Pendiente" },
    running: { cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", label: "Descargando" },
    downloaded: {
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      label: "Descargado",
    },
    failed: { cls: "bg-red-500/10 text-red-700 dark:text-red-400", label: "Falló" },
  } as const;
  const c = config[state];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.cls}`}
    >
      {state === "running" && <Loader2 size={9} className="animate-spin" />}
      {c.label}
    </span>
  );
}

type Props = {
  orders: CleoOrderRow[];
  failedCount: number;
  pendingCount: number;
};

export function CleoHistorialClient({ orders }: Props) {
  const router = useRouter();
  const [localOrders, setLocalOrders] = useState(orders);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [emailDrawerId, setEmailDrawerId] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<LogLine[]>([]);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [rescueId, setRescueId] = useState("");
  const [rescuing, setRescuing] = useState(false);
  const [reparsingId, setReparsingId] = useState<string | null>(null);
  const [clearingErrors, setClearingErrors] = useState(false);

  const localFailed = localOrders.filter((o) => o.state === "failed").length;
  const localPending = localOrders.filter((o) => o.state === "pending" || o.state === "running").length;
  const hasActive = localOrders.some((o) => o.state === "pending" || o.state === "running");
  const hasFailed = localFailed > 0;

  // Auto-refresh: 12s cuando hay pending/running, 30s cuando hay failed (cron trabajando)
  useEffect(() => {
    if (!hasActive && !hasFailed) return;
    const interval = hasActive ? 12_000 : 30_000;
    const id = setInterval(() => router.refresh(), interval);
    return () => clearInterval(id);
  }, [hasActive, hasFailed]);

  async function clearErrors() {
    if (clearingErrors) return;
    setClearingErrors(true);
    try {
      const r = await fetch("/api/ingest/cleo/clear-errors", { method: "POST" });
      const body = (await r.json().catch(() => null)) as { ok?: boolean; deleted?: number } | null;
      if (r.ok && body?.ok) {
        toast.success(`${body.deleted ?? 0} error(es) eliminados`);
        setLocalOrders((prev) => prev.filter((o) => o.state !== "failed"));
      } else {
        toast.error("No se pudo limpiar");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fallo");
    } finally {
      setClearingErrors(false);
    }
  }

  async function reparse(id: string) {
    if (reparsingId) return;
    setReparsingId(id);
    try {
      const r = await fetch(`/api/ingest/cleo/orders/${id}/reparse`, { method: "POST" });
      const body = (await r.json().catch(() => null)) as {
        ok?: boolean; provider_found?: boolean; buying_party_name?: string; error?: string;
      } | null;
      if (r.ok && body?.ok) {
        const prov = body.provider_found ? ` · proveedor detectado` : " · sin proveedor";
        toast.success(`Re-parseado${prov}`);
        setTimeout(() => router.refresh(), 1500);
      } else {
        toast.error(`Error: ${body?.error ?? r.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fallo");
    } finally {
      setReparsingId(null);
    }
  }

  async function rescue() {
    const msgId = rescueId.trim();
    if (!msgId || rescuing) return;
    setRescuing(true);
    setTerminalLines([]);
    setShowTerminal(true);
    setTerminalRunning(true);
    try {
      const res = await fetch("/api/ingest/cleo/manual-dispatch-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: msgId }),
      });
      if (!res.ok || !res.body) {
        toast.error(`Error HTTP ${res.status}`);
        return;
      }
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
              | { done: true; result?: { ok?: boolean; reason?: string; document_id?: string } }
              | { error: string };
            if ("done" in data && data.done) {
              const r = "result" in data ? data.result : null;
              if (r?.ok) {
                toast.success(`Orden ${msgId} descargada`);
                setRescueId("");
                setTimeout(() => router.refresh(), 1500);
              } else {
                toast.error(`Error: ${r?.reason ?? "fallo desconocido"}`);
              }
              break;
            }
            if ("level" in data) setTerminalLines((prev) => [...prev, data]);
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fallo");
    } finally {
      setRescuing(false);
      setTerminalRunning(false);
    }
  }

  async function retry(id: string) {
    setRetryingId(id);
    setTerminalLines([]);
    setShowTerminal(true);
    setTerminalRunning(true);
    try {
      const res = await fetch(`/api/ingest/cleo/orders/${id}/retry-stream`, { method: "POST" });
      if (!res.ok || !res.body) {
        if (!res.ok) {
          const check = await fetch(`/api/ingest/cleo/orders/${id}/status`).catch(() => null);
          const checkBody = (await check?.json().catch(() => null)) as { state?: string } | null;
          if (checkBody?.state === "downloaded") {
            toast.success("Orden descargada con éxito");
            router.refresh();
            return;
          }
        }
        toast.error(`Retry falló (HTTP ${res.status})`);
        return;
      }
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
              | { done: true; result?: { ok?: boolean; reason?: string } }
              | { error: string };
            if ("done" in data && data.done) {
              if ("result" in data && data.result?.ok) {
                toast.success("Orden descargada con éxito");
                setTimeout(() => router.refresh(), 1500);
              } else if ("result" in data && data.result && !data.result.ok) {
                toast.error(`Retry falló: ${data.result.reason ?? "error desconocido"}`);
              }
              break;
            }
            if ("level" in data) {
              setTerminalLines((prev) => [...prev, data]);
            }
          } catch {
            // JSON inválido — ignorar
          }
        }
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "fallo"}`);
    } finally {
      setRetryingId(null);
      setTerminalRunning(false);
    }
  }

  async function retryAll() {
    if (retryingAll) return;
    setRetryingAll(true);
    setTerminalLines([]);
    setShowTerminal(true);
    setTerminalRunning(true);
    try {
      const res = await fetch("/api/ingest/cleo/retry-batch-stream", { method: "POST" });
      if (!res.ok || !res.body) {
        toast.error(`Error HTTP ${res.status}`);
        return;
      }
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
              | { done: true; succeeded?: number; failed?: number }
              | { error: string };
            if ("done" in data && data.done) {
              const ok = "succeeded" in data ? data.succeeded ?? 0 : 0;
              const fail = "failed" in data ? data.failed ?? 0 : 0;
              if (ok > 0 && fail === 0) {
                toast.success(`${ok} orden(es) descargadas`);
              } else if (ok > 0) {
                toast.warning(`${ok} OK, ${fail} fallidas`);
              } else if (fail > 0) {
                toast.error(`${fail} orden(es) fallaron — revisá el terminal`);
              }
              setTimeout(() => router.refresh(), 2000);
              break;
            }
            if ("level" in data) setTerminalLines((prev) => [...prev, data]);
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fallo");
    } finally {
      setRetryingAll(false);
      setTerminalRunning(false);
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <div className="flex items-center gap-3">
          <Image src="/connector-logo.svg" alt="Supplier Portal" width={110} height={32} className="h-8 w-auto" />
          <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-fg)]">
            <ClipboardList size={15} className="text-[var(--color-fg-mute)]" />
            Historial de órdenes
          </span>
        </div>
        <p className="mt-1.5 text-sm text-[var(--color-fg-mute)]">
          Últimas 100 órdenes 850 procesadas desde Supplier Portal
        </p>
      </div>

      {/* Content */}
      <div className="px-6 py-6 space-y-6">

        {/* Panel: rescatar orden por Message ID */}
        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-1 flex items-center gap-2">
            <Search size={14} className="text-[var(--color-fg-mute)]" />
            <h2 className="text-sm font-semibold">Rescatar orden por Message ID</h2>
          </div>
          <p className="mb-3 text-xs text-[var(--color-fg-mute)]">
            Ingresá el <strong>Supplier Portal Message ID</strong> (número de 10 dígitos del portal).
            Si ya existe en el sistema lo detecta; si no, inicia sesión en Supplier Portal y lo descarga.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="ej. 7785038544"
              value={rescueId}
              onChange={(e) => setRescueId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void rescue(); }}
              className="h-8 max-w-xs font-mono text-xs"
              disabled={rescuing}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void rescue()}
              disabled={rescuing || !rescueId.trim()}
              className="h-8"
            >
              {rescuing
                ? <Loader2 size={13} className="mr-1 animate-spin" />
                : <Download size={13} className="mr-1" />}
              {rescuing ? "Descargando…" : "Descargar"}
            </Button>
          </div>
        </section>

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

        {/* Tabla de órdenes */}
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
            <div>
              <h3 className="text-sm font-semibold">Historial de órdenes</h3>
              <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
                Últimas 100 órdenes 850 procesadas desde Supplier Portal
              </p>
            </div>
            <div className="flex items-center gap-3">
              {(localFailed > 0 || localPending > 0) && (
                <div className="flex items-center gap-2">
                  {localPending > 0 && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <Loader2 size={12} className="animate-spin" />
                      Procesando {localPending}…
                    </span>
                  )}
                  {localFailed > 0 && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={retryAll}
                        disabled={retryingAll}
                      >
                        {retryingAll ? (
                          <Loader2 size={14} className="mr-1 animate-spin" />
                        ) : (
                          <RefreshCw size={14} className="mr-1" />
                        )}
                        Reintentar todos ({localFailed})
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearErrors}
                        disabled={clearingErrors}
                        className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                      >
                        {clearingErrors ? (
                          <Loader2 size={14} className="mr-1 animate-spin" />
                        ) : (
                          <Trash2 size={14} className="mr-1" />
                        )}
                        Limpiar errores
                      </Button>
                    </>
                  )}
                </div>
              )}
              {hasFailed && !hasActive && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Cron reintentando en
                  <CronCountdown intervalMin={15} label="Auto-retry Supplier Portal" />
                </span>
              )}
              {!hasFailed && <CronCountdown intervalMin={15} label="Auto-retry Supplier Portal" />}
              <a
                href={PORTAL_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                <ExternalLink size={12} />
                Abrir portal Supplier Portal
              </a>
            </div>
          </div>
          {localOrders.length === 0 ? (
            <div className="p-12 text-center text-sm text-[var(--color-fg-mute)]">
              Aún no hay órdenes procesadas. Cuando llegue una notificación de Supplier Portal a{" "}
              <code className="font-mono text-xs">orders@example.com</code>, aparecerá aquí.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase text-[var(--color-fg-mute)]">
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="px-3 py-2 text-left">Trading Partner</th>
                    <th className="px-3 py-2 text-left">PO Reference</th>
                    <th className="px-3 py-2 text-left">Supplier Portal Msg ID</th>
                    <th className="px-3 py-2 text-left">Recibido</th>
                    <th className="px-3 py-2 text-left">Intentos</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {localOrders.map((o) => (
                    <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-2">
                        <StateBadge state={o.state} />
                      </td>
                      <td className="px-3 py-2 font-medium">{o.trading_partner ?? "—"}</td>
                      <td className="px-3 py-2 font-mono">{o.cleo_reference ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[var(--color-fg-mute)]">
                        {o.cleo_message_id}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-fg-mute)]">
                        {new Date(o.created_at).toLocaleString("es-MX", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{o.attempts}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          {o.inbound_email_id && (
                            <button
                              type="button"
                              title="Ver email origen"
                              onClick={() => setEmailDrawerId(o.inbound_email_id)}
                              className="text-[var(--color-fg-mute)] hover:text-blue-600 transition-colors"
                            >
                              <Mail size={13} />
                            </button>
                          )}
                          {o.state === "failed" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => retry(o.id)}
                              disabled={retryingId === o.id}
                              className="h-7 px-2 text-xs"
                            >
                              {retryingId === o.id ? (
                                <Loader2 size={12} className="mr-1 animate-spin" />
                              ) : (
                                <RefreshCw size={12} className="mr-1" />
                              )}
                              Reintentar
                            </Button>
                          )}
                          {o.state === "downloaded" && (
                            <>
                              {o.html_storage_path ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => reparse(o.id)}
                                  disabled={reparsingId === o.id}
                                  className="h-7 px-2 text-xs"
                                  title="Re-parsear HTML guardado con el parser actualizado"
                                >
                                  {reparsingId === o.id ? (
                                    <Loader2 size={12} className="mr-1 animate-spin" />
                                  ) : (
                                    <RefreshCw size={12} className="mr-1" />
                                  )}
                                  Re-parsear
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => retry(o.id)}
                                  disabled={retryingId === o.id}
                                  className="h-7 px-2 text-xs"
                                  title="Re-descargar desde el portal Supplier Portal (HTML no disponible localmente)"
                                >
                                  {retryingId === o.id ? (
                                    <Loader2 size={12} className="mr-1 animate-spin" />
                                  ) : (
                                    <RefreshCw size={12} className="mr-1" />
                                  )}
                                  Reintentar
                                </Button>
                              )}
                              {o.document_id && (
                                <a
                                  href={`/inbox?doc=${o.document_id}`}
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                >
                                  <FileText size={12} />
                                  Ver doc
                                </a>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {localOrders.some((o) => o.state === "failed" && o.last_error) && (
            <div className="border-t border-[var(--color-border)] p-3">
              <details>
                <summary className="cursor-pointer text-xs font-medium text-[var(--color-fg-mute)]">
                  Ver últimos errores
                </summary>
                <ul className="mt-2 grid gap-1 text-xs">
                  {localOrders
                    .filter((o) => o.state === "failed" && o.last_error)
                    .slice(0, 5)
                    .map((o) => (
                      <li key={o.id} className="rounded-sm bg-red-50 p-2 dark:bg-red-950/30">
                        <span className="font-mono">{o.cleo_message_id}</span>:{" "}
                        <span className="text-red-700 dark:text-red-300">{o.last_error}</span>
                      </li>
                    ))}
                </ul>
              </details>
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
              <button
                type="button"
                onClick={() => setShowTerminal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X size={13} />
              </button>
            </div>
            <div className="p-2">
              <CleoTerminal lines={terminalLines} running={terminalRunning} />
            </div>
          </div>
        )}
      </div>

      <EmailViewerDrawer
        inboundEmailId={emailDrawerId}
        open={emailDrawerId !== null}
        onOpenChange={(open) => {
          if (!open) setEmailDrawerId(null);
        }}
      />
    </div>
  );
}
