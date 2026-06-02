"use client";

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
} from "lucide-react";
import { CronCountdown } from "@/components/app/cron-countdown";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { RithumOrderRow } from "../rithum-dashboard-client";

const PORTAL_URL = "https://dsm.commercehub.com/dsm/gotoHome.do";

type LogLine = { level: "info" | "ok" | "warn" | "error"; msg: string; t: string };

function StateBadge({ state }: { state: RithumOrderRow["state"] }) {
  const config = {
    pending: { cls: "bg-slate-500/10 text-slate-700 dark:text-slate-400", label: "Pendiente" },
    running: { cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", label: "Descargando" },
    downloaded: {
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      label: "Descargado",
    },
    failed: { cls: "bg-red-500/10 text-red-700 dark:text-red-400", label: "Falló" },
    manual_required: {
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      label: "Manual",
    },
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
  orders: RithumOrderRow[];
  failedCount: number;
  pendingCount: number;
};

export function RithumHistorialClient({ orders }: Props) {
  const router = useRouter();
  const [localOrders, setLocalOrders] = useState(orders);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [emailDrawerId, setEmailDrawerId] = useState<string | null>(null);
  const [manualPo, setManualPo] = useState("");
  const [manualPartner, setManualPartner] = useState("The Retailer A Inc");
  const [manualDispatching, setManualDispatching] = useState(false);
  const [terminalLines, setTerminalLines] = useState<LogLine[]>([]);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);

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

  async function retry(id: string) {
    setRetryingId(id);
    setTerminalLines([]);
    setShowTerminal(true);
    setTerminalRunning(true);
    try {
      const res = await fetch(`/api/ingest/rithum/orders/${id}/retry-stream`, { method: "POST" });
      if (!res.ok || !res.body) {
        if (!res.ok) {
          const check = await fetch(`/api/ingest/rithum/orders/${id}/status`).catch(() => null);
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
    try {
      const r = await fetch("/api/ingest/rithum/retry-batch", { method: "POST" });
      const body = (await r.json().catch(() => null)) as { queued?: number } | null;
      const n = body?.queued ?? 0;
      if (n === 0) {
        toast.info("No hay órdenes fallidas para reintentar");
      } else {
        toast.success(`${n} orden(es) encoladas — procesando en background`);
        setLocalOrders((prev) =>
          prev.map((o) => (o.state === "failed" ? { ...o, state: "pending" as const } : o)),
        );
      }
    } catch {
      toast.error("Error al iniciar el batch de reintentos");
    } finally {
      setRetryingAll(false);
    }
  }

  async function manualDispatch(e: React.FormEvent) {
    e.preventDefault();
    const po = manualPo.trim();
    if (!po || manualDispatching) return;
    setManualDispatching(true);
    try {
      const r = await fetch("/api/ingest/rithum/manual-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ po_number: po, partner: manualPartner }),
      });
      const body = (await r.json().catch(() => null)) as { ok?: boolean; reason?: string; document_id?: string } | null;
      if (r.ok && body?.ok) {
        toast.success(`Orden ${po} descargada — documento creado`);
        setManualPo("");
        setTimeout(() => router.refresh(), 1500);
      } else {
        toast.error(`Error: ${body?.reason ?? `HTTP ${r.status}`}`);
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "fallo"}`);
    } finally {
      setManualDispatching(false);
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <div className="flex items-center gap-3">
          <ClipboardList size={20} className="text-[var(--color-fg-mute)]" />
          <h1 className="text-base font-semibold text-[var(--color-fg)]">Historial de órdenes</h1>
        </div>
        <p className="mt-1.5 text-sm text-[var(--color-fg-mute)]">
          Últimas 100 órdenes procesadas desde Supplier Portal (Retailer A, Marketplace Marketplace)
        </p>
      </div>

      {/* Content */}
      <div className="px-6 py-6 space-y-6">
        {/* Tabla de órdenes */}
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
            <div>
              <h3 className="text-sm font-semibold">Historial de órdenes</h3>
              <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
                Últimas 100 órdenes procesadas desde Supplier Portal (Retailer A, Marketplace Marketplace)
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
                    <th className="px-3 py-2 text-left">Partner</th>
                    <th className="px-3 py-2 text-left">PO Number</th>
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
                      <td className="px-3 py-2 font-medium">{o.rithum_partner ?? "—"}</td>
                      <td className="px-3 py-2 font-mono">{o.rithum_order_number}</td>
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
                              onClick={() => setEmailDrawerId(o.inbound_email_id)}
                              className="inline-flex items-center gap-1 text-xs text-[var(--color-fg-mute)] hover:text-blue-600 transition-colors"
                            >
                              <Mail size={12} />
                              Email
                            </button>
                          )}
                          {(o.state === "failed" || o.state === "manual_required") && (
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
                          {o.document_id && o.state === "downloaded" && (
                            <a
                              href={`/inbox?doc=${o.document_id}`}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                            >
                              <FileText size={12} />
                              Ver doc
                            </a>
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
                        <span className="font-mono">{o.rithum_order_number}</span>:{" "}
                        <span className="text-red-700 dark:text-red-300">{o.last_error}</span>
                      </li>
                    ))}
                </ul>
              </details>
            </div>
          )}
        </div>

        {/* Procesar orden manual */}
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Download size={14} className="text-[var(--color-fg-mute)]" />
            <h3 className="text-sm font-semibold">Procesar orden manualmente</h3>
          </div>
          <p className="mb-4 text-xs text-[var(--color-fg-mute)]">
            Ingresá el PO Number de Supplier Portal para descargarlo ahora, sin importar el estado en el
            portal.
          </p>
          <form onSubmit={manualDispatch} className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-fg-mute)]">PO Number</label>
              <input
                type="text"
                value={manualPo}
                onChange={(e) => setManualPo(e.target.value)}
                placeholder="ej. 35701677"
                className="h-8 rounded-md border border-[var(--color-border)] bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)] w-36"
                disabled={manualDispatching}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-fg-mute)]">Partner</label>
              <select
                value={manualPartner}
                onChange={(e) => setManualPartner(e.target.value)}
                className="h-8 rounded-md border border-[var(--color-border)] bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
                disabled={manualDispatching}
              >
                <option value="The Retailer A Inc">The Retailer A Inc</option>
                <option value="Retailer A Special Orders">Retailer A Special Orders</option>
              </select>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={!manualPo.trim() || manualDispatching}
            >
              {manualDispatching ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Download size={14} className="mr-1" />
              )}
              {manualDispatching ? "Procesando…" : "Descargar"}
            </Button>
          </form>
        </div>

        {/* Terminal de logs */}
        {showTerminal && (
          <div className="rounded-md border border-slate-800 bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-300">Logs del proceso</span>
                {terminalRunning && <Loader2 size={11} className="animate-spin text-slate-500" />}
              </div>
              <button
                type="button"
                onClick={() => setShowTerminal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </div>
            <div className="p-2">
              <div className="h-64 overflow-y-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-relaxed">
                {terminalLines.length === 0 && (
                  <span className="text-slate-500">
                    {terminalRunning ? "Iniciando..." : "Sin logs aún."}
                  </span>
                )}
                {terminalLines.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0 text-slate-600">{l.t}</span>
                    <span className={
                      l.level === "ok" ? "text-emerald-400" :
                      l.level === "warn" ? "text-amber-400" :
                      l.level === "error" ? "text-red-400" :
                      "text-slate-300"
                    }>{l.msg}</span>
                  </div>
                ))}
                {terminalRunning && (
                  <div className="mt-1 flex items-center gap-1 text-slate-500">
                    <span className="inline-block size-1.5 animate-pulse rounded-full bg-slate-500" />
                    procesando...
                  </div>
                )}
              </div>
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
