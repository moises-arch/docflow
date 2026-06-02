"use client";

import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Book,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  PlayCircle,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import { EmailViewerDrawer } from "@/components/app/email-viewer-drawer";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type CleoOrderRow = {
  id: string;
  cleo_message_id: string;
  cleo_reference: string | null;
  cleo_batch_id: string | null;
  trading_partner: string | null;
  inbound_email_id: string | null;
  document_id: string | null;
  html_storage_path: string | null;
  state: "pending" | "running" | "downloaded" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CleoSmokeRun = {
  id: string;
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string; ms?: number }>;
  created_at: string;
};

type Stats = {
  total: number;
  downloaded: number;
  pending: number;
  failed: number;
  last_downloaded_at: string | null;
};

type Props = {
  orders: CleoOrderRow[];
  smokeRuns: CleoSmokeRun[];
  stats: Stats;
};

const PORTAL_URL = "https://portal.example.com/webedi/view/home";

export function CleoDashboardClient({ orders, smokeRuns, stats }: Props) {
  const router = useRouter();
  const [smokeRunning, setSmokeRunning] = useState(false);
  const [smokeResult, setSmokeResult] = useState<CleoSmokeRun | null>(
    smokeRuns[0] ?? null,
  );
  const [localOrders, setLocalOrders] = useState(orders);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [emailDrawerId, setEmailDrawerId] = useState<string | null>(null);

  // Auto-polling: si hay órdenes pending/running al cargar (o después de iniciar batch),
  // recarga la página cada 12s hasta que todas estén en estado terminal.
  const hasActive = localOrders.some((o) => o.state === "pending" || o.state === "running");
  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(() => router.refresh(), 12_000);
    return () => clearInterval(id);
  }, [hasActive]);

  async function runSmoke() {
    if (smokeRunning) return;
    setSmokeRunning(true);
    try {
      const r = await fetch("/api/ingest/cleo/smoke", { method: "POST" });
      const body = (await r.json().catch(() => null)) as
        | { ok: boolean; ran_at: string; checks: CleoSmokeRun["checks"] }
        | null;
      if (!body) {
        toast.error("Smoke test devolvió respuesta vacía");
        return;
      }
      setSmokeResult({
        id: "live",
        ok: body.ok,
        checks: body.checks,
        created_at: body.ran_at,
      });
      if (body.ok) toast.success("Smoke test OK — todo verde");
      else toast.error(`Smoke test detectó ${body.checks.filter((c) => !c.ok).length} falla(s)`);
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "fallo desconocido"}`);
    } finally {
      setSmokeRunning(false);
    }
  }

  async function scanPending() {
    if (scanning) return;
    setScanning(true);
    try {
      const r = await fetch("/api/ingest/cleo/scan-pending", { method: "POST" });
      const body = (await r.json().catch(() => null)) as {
        candidates?: number;
        cleo_detected?: number;
        dispatched?: number;
        archived?: number;
        skipped?: number;
        errors?: Array<{ doc_id: string; reason: string }>;
      } | null;
      if (!r.ok || !body) {
        toast.error("Scan falló");
        return;
      }
      if ((body.cleo_detected ?? 0) === 0) {
        toast.success("No se encontraron notificaciones Supplier Portal pendientes");
      } else {
        toast.success(
          `${body.dispatched} orden(es) procesadas, ${body.archived} HTML archivado(s)`,
        );
      }
      if ((body.errors ?? []).length > 0) {
        toast.error(`${body.errors!.length} error(es) — ver consola`);
        console.warn("scan-pending errors", body.errors);
      }
      setTimeout(() => router.refresh(), 1500);
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "fallo"}`);
    } finally {
      setScanning(false);
    }
  }

  async function retry(id: string) {
    setRetryingId(id);
    try {
      const r = await fetch(`/api/ingest/cleo/orders/${id}/retry`, { method: "POST" });
      const body = (await r.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (r.ok && body?.ok) {
        toast.success("Orden descargada con éxito");
        router.refresh();
      } else {
        toast.error(`Retry falló: ${body?.reason ?? r.status}`);
      }
    } finally {
      setRetryingId(null);
    }
  }

  async function retryAll() {
    if (retryingAll) return;
    setRetryingAll(true);
    try {
      const r = await fetch("/api/ingest/cleo/retry-batch", { method: "POST" });
      const body = (await r.json().catch(() => null)) as { queued?: number } | null;
      const n = body?.queued ?? 0;
      if (n === 0) {
        toast.info("No hay órdenes fallidas para reintentar");
      } else {
        toast.success(`${n} orden(es) encoladas — procesando en background`);
        // Actualizar estado local a pending para feedback inmediato
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

  // Recalcular stats desde localOrders (refleja cambios optimistas)
  const localFailed = localOrders.filter((o) => o.state === "failed").length;
  const localPending = localOrders.filter((o) => o.state === "pending" || o.state === "running").length;
  const failureRate = localOrders.length > 0 ? localFailed / localOrders.length : 0;
  const hasFailures = localFailed > 0;
  const lastSmoke = smokeResult;
  const smokeFailed = lastSmoke && !lastSmoke.ok;

  return (
    <div className="grid gap-4">
      {/* ── Alert banner ──────────────────────────────────────────────────── */}
      {(smokeFailed || (hasFailures && failureRate > 0.2)) && (
        <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">
              {smokeFailed
                ? "Smoke test detectó problemas en la integración"
                : `Tasa de fallas alta: ${(failureRate * 100).toFixed(0)}% de órdenes fallaron`}
            </div>
            {smokeFailed && (
              <ul className="mt-1 list-inside list-disc text-xs">
                {lastSmoke!.checks
                  .filter((c) => !c.ok)
                  .map((c) => (
                    <li key={c.name}>
                      <code>{c.name}</code> — {c.detail}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<Download size={14} />}
          label="Descargados"
          value={stats.downloaded.toString()}
          tone="ok"
        />
        <StatCard
          icon={<Clock size={14} />}
          label="En curso"
          value={localPending.toString()}
          tone={localPending > 0 ? "warn" : "neutral"}
        />
        <StatCard
          icon={<AlertTriangle size={14} />}
          label="Fallidos"
          value={localFailed.toString()}
          tone={localFailed > 0 ? "error" : "neutral"}
        />
        <StatCard
          icon={<Zap size={14} />}
          label="Último download"
          value={
            stats.last_downloaded_at
              ? new Date(stats.last_downloaded_at).toLocaleString("es-MX", {
                  dateStyle: "short",
                  timeStyle: "short",
                })
              : "—"
          }
          tone="neutral"
        />
      </div>

      {/* ── Smoke test panel ──────────────────────────────────────────────── */}
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-[var(--color-fg-mute)]" />
            <h2 className="text-sm font-semibold">Salud de la integración</h2>
            {lastSmoke && (
              <StatusDot ok={lastSmoke.ok} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={scanPending}
              disabled={scanning}
              title="Buscar correos de notificación Supplier Portal recibidos antes de la integración y procesarlos ahora"
            >
              {scanning ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Mail size={14} className="mr-1" />
              )}
              Procesar pendientes
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runSmoke}
              disabled={smokeRunning}
            >
              {smokeRunning ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <PlayCircle size={14} className="mr-1" />
              )}
              Correr smoke test
            </Button>
          </div>
        </div>
        {lastSmoke ? (
          <div className="grid gap-1.5">
            <div className="text-xs text-[var(--color-fg-mute)]">
              Última corrida:{" "}
              {new Date(lastSmoke.created_at).toLocaleString("es-MX", {
                dateStyle: "short",
                timeStyle: "medium",
              })}
            </div>
            <ul className="grid gap-1">
              {lastSmoke.checks.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center justify-between rounded-sm border bg-background px-3 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    {c.ok ? (
                      <CheckCircle2 size={12} className="text-emerald-600" />
                    ) : (
                      <AlertTriangle size={12} className="text-red-600" />
                    )}
                    <code className="font-mono">{c.name}</code>
                  </div>
                  <span
                    className={`text-[10px] ${
                      c.ok ? "text-[var(--color-fg-mute)]" : "text-red-600"
                    }`}
                  >
                    {c.detail}
                    {typeof c.ms === "number" && ` · ${c.ms}ms`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-xs text-[var(--color-fg-mute)]">
            No se ha corrido smoke test todavía. Click <em>Correr smoke test</em> para verificar.
          </div>
        )}
      </section>

      {/* ── Orders history ────────────────────────────────────────────────── */}
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
          <div>
            <h2 className="text-sm font-semibold">Historial de órdenes</h2>
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
        {orders.length === 0 ? (
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
                        {o.state === "failed" ? (
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
                        ) : o.document_id ? (
                          <a
                            href={`/inbox?doc=${o.document_id}`}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <FileText size={12} />
                            Ver doc
                          </a>
                        ) : null}
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
                {orders
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
      </section>

      {/* ── Inline documentation ──────────────────────────────────────────── */}
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        <button
          type="button"
          onClick={() => setShowDocs((v) => !v)}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-2">
            <Book size={14} className="text-[var(--color-fg-mute)]" />
            <h2 className="text-sm font-semibold">Cómo funciona la integración</h2>
          </div>
          {showDocs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showDocs && (
          <div className="space-y-4 border-t border-[var(--color-border)] p-4 text-sm text-[var(--color-fg)]">
            <div>
              <h3 className="mb-1 font-semibold">Flujo end-to-end</h3>
              <ol className="ml-4 list-decimal space-y-1 text-xs text-[var(--color-fg-mute)]">
                <li>
                  Marketplace, Retailer B, Retailer C, etc. envían sus 850 (Purchase Orders) al portal Supplier Portal
                  Portal.
                </li>
                <li>
                  Supplier Portal manda un correo de notificación a{" "}
                  <code className="font-mono">orders@example.com</code> con una tabla HTML que
                  contiene el <strong>Message ID</strong> de cada PO.
                </li>
                <li>
                  El Edge Function <code>email-ingest</code> detecta la notificación, parsea la
                  tabla y dispatcha solo las filas con <code>Document = 850</code>.
                </li>
                <li>
                  El runner Playwright en Vercel se loguea a Supplier Portal, llama{" "}
                  <code>WEBEDI.doc.printDocument(messageId)</code> y descarga el PDF.
                </li>
                <li>
                  El PDF entra al pipeline de IA que extrae líneas, cantidades y precios para
                  crear un <code>order_draft</code> sincronizable a ERP.
                </li>
              </ol>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">¿Por qué activamos por correo y no por cron?</h3>
              <p className="text-xs text-[var(--color-fg-mute)]">
                Supplier Portal no marca los mensajes como "leídos" si otro usuario abre la orden en el
                portal — en ese caso un cron basado en estado se la perdería. Usar el correo como
                trigger garantiza que cada notificación se procese una vez (idempotencia por{" "}
                <code>cleo_message_id</code>).
              </p>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">Filtros aplicados</h3>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-[var(--color-fg-mute)]">
                <li>
                  Solo se procesan filas con <code>Document = "850"</code> (Purchase Orders).
                  Cualquier otro tipo (855, 856, 997, etc.) se ignora.
                </li>
                <li>
                  Notificaciones de Supplier Portal ya NO crean documentos HTML basura en el Inbox.
                </li>
                <li>
                  Archivos adjuntos inline (firmas de Outlook) se descartan automáticamente.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">Si algo falla</h3>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-[var(--color-fg-mute)]">
                <li>
                  Las órdenes con <code>state = failed</code> aparecen en la tabla con botón{" "}
                  <em>Reintentar</em>.
                </li>
                <li>
                  Smoke test verifica env vars, conectividad al portal, y endpoint del runner.
                </li>
                <li>
                  Si el password de Supplier Portal cambia, el runner falla con{" "}
                  <code>cleo_credentials_missing</code> o login error — actualizar{" "}
                  <code>CLEO_PASSWORD</code> en Vercel.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">Endpoints</h3>
              <ul className="ml-4 grid gap-0.5 font-mono text-xs text-[var(--color-fg-mute)]">
                <li>POST /api/ingest/cleo/process — runner (token-protected)</li>
                <li>POST /api/ingest/cleo/smoke — health check</li>
                <li>POST /api/ingest/cleo/orders/[id]/retry — reintenta una orden fallida</li>
              </ul>
            </div>

            <div className="rounded-md bg-[var(--color-bg)] p-3 text-xs">
              <span className="font-medium">¿Necesitas más?</span>{" "}
              Ver guía completa en{" "}
              <a className="text-blue-600 hover:underline" href="/help/cleo-webedi">
                Help Center → Supplier Portal
              </a>
              .
            </div>
          </div>
        )}
      </section>

      {/* ── Configuration card ────────────────────────────────────────────── */}
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Mail size={14} className="text-[var(--color-fg-mute)]" />
          Configuración actual
        </h2>
        <dl className="grid gap-1.5 text-xs">
          <Row label="Trigger">
            Correos a <code className="font-mono">orders@example.com</code>
          </Row>
          <Row label="Portal">
            <a className="text-blue-600 hover:underline" href={PORTAL_URL} target="_blank" rel="noreferrer">
              portal.example.com
            </a>
          </Row>
          <Row label="Filtro">Document = 850 (Purchase Orders únicamente)</Row>
          <Row label="Cuenta">DocFlow</Row>
        </dl>
      </section>

      <EmailViewerDrawer
        inboundEmailId={emailDrawerId}
        open={emailDrawerId !== null}
        onOpenChange={(open) => { if (!open) setEmailDrawerId(null); }}
      />
    </div>
  );
}

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
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.cls}`}>
      {state === "running" && <Loader2 size={9} className="animate-spin" />}
      {c.label}
    </span>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-baseline gap-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-fg-mute)]">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
