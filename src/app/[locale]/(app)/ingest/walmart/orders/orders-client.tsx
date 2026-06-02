"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckCircle,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";

type Order = {
  id: string;
  walmart_po_id: string;
  customer_order_id: string | null;
  state: string;
  source: string;
  attempts: number;
  last_error: string | null;
  document_id: string | null;
  parsed_payload: { totals?: { grand_total?: number } } | null;
  acknowledged_at: string | null;
  created_at: string;
};

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function OrdersClient({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [manualPo, setManualPo] = useState("");
  const [dispatching, setDispatching] = useState(false);

  async function dispatchManual() {
    const po = manualPo.trim();
    if (!po) return;
    setDispatching(true);
    try {
      const r = await fetch("/api/ingest/walmart/manual-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ po_number: po }),
      });
      const body = await r.json().catch(() => null);
      if (r.ok) {
        toast.success(`PO ${po} enviado a procesar`);
        setManualPo("");
        setTimeout(() => router.refresh(), 1500);
      } else {
        toast.error(`Error: ${(body as { reason?: string } | null)?.reason ?? r.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fallo");
    } finally {
      setDispatching(false);
    }
  }

  const filtered =
    filter === "all" ? orders : orders.filter((o) => o.state === filter);

  async function retry(id: string) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/ingest/walmart/orders/${id}/retry`, { method: "POST" });
      if (r.ok) {
        toast.success("Reintentando...");
        setTimeout(() => router.refresh(), 1500);
      } else {
        const body = (await r.json().catch(() => null)) as { reason?: string } | null;
        toast.error(`Falló: ${body?.reason ?? r.status}`);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function acknowledge(id: string) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/ingest/walmart/orders/${id}/acknowledge`, { method: "POST" });
      if (r.ok) {
        toast.success("Acknowledged");
        setTimeout(() => router.refresh(), 1000);
      } else {
        toast.error(`Falló: ${r.status}`);
      }
    } finally {
      setBusyId(null);
    }
  }

  const stateOptions = [
    { value: "all", label: `Todas (${orders.length})` },
    { value: "downloaded", label: `Descargadas (${orders.filter((o) => o.state === "downloaded").length})` },
    { value: "pending", label: `Pendientes (${orders.filter((o) => o.state === "pending").length})` },
    { value: "running", label: `Procesando (${orders.filter((o) => o.state === "running").length})` },
    { value: "failed", label: `Fallidas (${orders.filter((o) => o.state === "failed").length})` },
    { value: "manual_required", label: `Manual (${orders.filter((o) => o.state === "manual_required").length})` },
  ];

  return (
    <div className="grid gap-4">
      {/* Panel: procesar PO manualmente */}
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold">Procesar PO manualmente</h2>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            placeholder="PO Number (Marketplace)"
            value={manualPo}
            onChange={(e) => setManualPo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void dispatchManual(); }}
            className="h-8 max-w-xs text-xs font-mono"
            disabled={dispatching}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void dispatchManual()}
            disabled={dispatching || !manualPo.trim()}
            className="h-8"
          >
            {dispatching ? (
              <Loader2 size={12} className="mr-1 animate-spin" />
            ) : (
              <Send size={12} className="mr-1" />
            )}
            Procesar
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-[var(--color-fg-mute)]">
          Ingresá el PO Number de Marketplace para descargar y procesar la orden manualmente.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {stateOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === opt.value
                ? "bg-[var(--color-blue)] text-white"
                : "bg-[var(--color-surface)] text-[var(--color-fg-mute)] hover:bg-[var(--color-surface-mute)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-fg-mute)]">
            No hay órdenes con este filtro.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-[var(--color-fg-mute)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">PO Number</th>
                  <th className="px-3 py-2 text-left">Customer Order</th>
                  <th className="px-3 py-2 text-left">Origen</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Ack</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2">{stateBadge(o.state)}</td>
                    <td className="px-3 py-2 font-mono">{o.walmart_po_id}</td>
                    <td className="px-3 py-2 font-mono text-[var(--color-fg-mute)]">
                      {o.customer_order_id ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-fg-mute)]">{o.source}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtCurrency(o.parsed_payload?.totals?.grand_total)}
                    </td>
                    <td className="px-3 py-2">
                      {o.acknowledged_at ? (
                        <CheckCircle size={12} className="text-emerald-600" />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-fg-mute)]">
                      {new Date(o.created_at).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        {(o.state === "failed" || o.state === "manual_required") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => retry(o.id)}
                            disabled={busyId === o.id}
                            className="h-7 px-2 text-xs"
                          >
                            {busyId === o.id ? (
                              <Loader2 size={12} className="mr-1 animate-spin" />
                            ) : (
                              <RefreshCw size={12} className="mr-1" />
                            )}
                            Retry
                          </Button>
                        )}
                        {o.state === "downloaded" && !o.acknowledged_at && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => acknowledge(o.id)}
                            disabled={busyId === o.id}
                            className="h-7 px-2 text-xs"
                          >
                            <CheckCircle size={12} className="mr-1" />
                            Ack
                          </Button>
                        )}
                        {o.document_id && (
                          <>
                            {/* Descargar PDF de la orden */}
                            <a
                              href={`/api/documents/${o.document_id}/download`}
                              target="_blank"
                              rel="noreferrer"
                              title="Descargar orden (PDF)"
                              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-[var(--color-fg-mute)] hover:bg-[var(--color-surface-mute)] hover:text-[var(--color-fg)] transition-colors"
                            >
                              <Download size={13} />
                            </a>
                            {/* Ver en inbox */}
                            <a
                              href={`/inbox?doc=${o.document_id}`}
                              title="Ver en inbox"
                              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-[var(--color-fg-mute)] hover:bg-[var(--color-surface-mute)] hover:text-[var(--color-fg)] transition-colors"
                            >
                              <FileText size={13} />
                            </a>
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
      </section>

      {filtered.some((o) => o.state === "failed" && o.last_error) && (
        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <details>
            <summary className="cursor-pointer text-xs font-medium text-[var(--color-fg-mute)]">
              Ver últimos errores
            </summary>
            <ul className="mt-2 grid gap-1 text-xs">
              {filtered
                .filter((o) => o.state === "failed" && o.last_error)
                .slice(0, 5)
                .map((o) => (
                  <li key={o.id} className="rounded-sm bg-red-50 p-2 dark:bg-red-950/30">
                    <span className="font-mono">{o.walmart_po_id}</span>:{" "}
                    <span className="text-red-700 dark:text-red-300">{o.last_error}</span>
                  </li>
                ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}

function stateBadge(state: string) {
  const config: Record<string, { cls: string; label: string }> = {
    pending: { cls: "bg-slate-500/10 text-slate-700 dark:text-slate-400", label: "Pendiente" },
    running: { cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", label: "Procesando" },
    downloaded: {
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      label: "Descargado",
    },
    failed: { cls: "bg-red-500/10 text-red-700 dark:text-red-400", label: "Falló" },
    manual_required: {
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      label: "Manual",
    },
  };
  const c = config[state] ?? { cls: "bg-slate-500/10 text-slate-500", label: state };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.cls}`}
    >
      {c.label}
    </span>
  );
}
