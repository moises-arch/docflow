"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

type Settings = {
  ai_fallback_enabled: boolean;
  auto_acknowledge: boolean;
  webhook_subscription_id: string | null;
};

type SmokeRun = {
  id: string;
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string; ms?: number }>;
  created_at: string;
};

export function SettingsClient({
  settings: initialSettings,
  smokeRuns,
}: {
  settings: Settings;
  smokeRuns: SmokeRun[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [smokeRunning, setSmokeRunning] = useState(false);
  const [latestSmoke, setLatestSmoke] = useState<SmokeRun | null>(smokeRuns[0] ?? null);

  async function toggle(key: keyof Settings, value: boolean) {
    setSavingKey(key);
    try {
      const r = await fetch("/api/ingest/walmart/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (r.ok) {
        const updated = (await r.json()) as Settings;
        setSettings(updated);
        toast.success("Guardado");
      } else {
        toast.error("Error guardando");
      }
    } finally {
      setSavingKey(null);
    }
  }

  async function runSmoke() {
    setSmokeRunning(true);
    try {
      const r = await fetch("/api/ingest/walmart/smoke", { method: "POST" });
      const body = (await r.json().catch(() => null)) as
        | { ok: boolean; ran_at: string; checks: SmokeRun["checks"] }
        | null;
      if (body) {
        setLatestSmoke({
          id: "live",
          ok: body.ok,
          checks: body.checks,
          created_at: body.ran_at,
        });
        if (body.ok) toast.success("Smoke test OK — todo verde");
        else toast.error(`${body.checks.filter((c) => !c.ok).length} falla(s)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fallo");
    } finally {
      setSmokeRunning(false);
    }
  }

  async function forceSync(type: string, label: string) {
    setSavingKey(type);
    try {
      const r = await fetch("/api/ingest/walmart/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const body = await r.json().catch(() => null);
      if (r.ok) toast.success(`${label} sincronizado`);
      else toast.error(`Error: ${(body as { error?: string } | null)?.error ?? r.status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fallo");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold">Configuración</h1>

      {/* Toggles */}
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold">Opciones</h2>
        <div className="grid gap-3">
          <ToggleRow
            label="Pipeline IA como respaldo"
            description="Si está activo, además de extraer del JSON corre Claude sobre el PDF como red de seguridad. Por default OFF — los datos del API ya son 100% confiables."
            checked={settings.ai_fallback_enabled}
            saving={savingKey === "ai_fallback_enabled"}
            onChange={(v) => toggle("ai_fallback_enabled", v)}
          />
          <ToggleRow
            label="Auto-acknowledge a Marketplace"
            description="Después de procesar la orden, confirma a Marketplace que la recibimos. Saca la orden del bucket released para que el cron no la re-procese."
            checked={settings.auto_acknowledge}
            saving={savingKey === "auto_acknowledge"}
            onChange={(v) => toggle("auto_acknowledge", v)}
          />
        </div>
      </section>

      {/* Webhook status */}
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Webhook PO_CREATED</h2>
          {!settings.webhook_subscription_id && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={savingKey === "subscribe-webhook"}
              onClick={() => forceSync("subscribe-webhook", "Webhook")}
            >
              {savingKey === "subscribe-webhook" ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <RefreshCw size={14} className="mr-1" />
              )}
              Suscribir
            </Button>
          )}
        </div>
        {settings.webhook_subscription_id ? (
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 size={14} />
            Suscripción activa:{" "}
            <code className="font-mono">{settings.webhook_subscription_id}</code>
          </div>
        ) : (
          <div className="text-xs text-amber-700 dark:text-amber-400">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span>
                Webhook no suscrito. El cron rescue (cada 30 min) sigue funcionando.
                Haz click en <strong>Suscribir</strong> para intentar activarlo.
              </span>
            </div>
            <p className="mt-1.5 text-[10px] text-[var(--color-fg-mute)]">
              Si Marketplace devuelve 404, significa que el Notifications API no está habilitado
              para esta cuenta — contactar Marketplace Developer Support para activarlo.
            </p>
          </div>
        )}
      </section>

      {/* Smoke test */}
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Salud de la integración</h2>
          <Button type="button" variant="outline" size="sm" onClick={runSmoke} disabled={smokeRunning}>
            {smokeRunning ? (
              <Loader2 size={14} className="mr-1 animate-spin" />
            ) : (
              <PlayCircle size={14} className="mr-1" />
            )}
            Smoke test
          </Button>
        </div>
        {latestSmoke ? (
          <>
            <div className="mb-2 text-xs text-[var(--color-fg-mute)]">
              Última corrida: {new Date(latestSmoke.created_at).toLocaleString("es-MX")}
            </div>
            <ul className="grid gap-1">
              {latestSmoke.checks.map((c, i) => (
                <li
                  key={`${c.name}-${i}`}
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
          </>
        ) : (
          <div className="text-xs text-[var(--color-fg-mute)]">
            Sin smoke test reciente. Apretá <em>Smoke test</em>.
          </div>
        )}
      </section>

      {/* Force sync */}
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold">Forzar sincronización</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {[
            { label: "Catálogo", type: "catalog" },
            { label: "Inventario", type: "inventory" },
            { label: "Performance", type: "performance" },
            { label: "Returns", type: "returns" },
            { label: "Buy Box", type: "buybox" },
            { label: "Scan órdenes", type: "scan-pending" },
          ].map((s) => (
            <Button
              key={s.type}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => forceSync(s.type, s.label)}
              disabled={savingKey === s.type}
              className="justify-start"
            >
              {savingKey === s.type ? (
                <Loader2 size={12} className="mr-1 animate-spin" />
              ) : (
                <RefreshCw size={12} className="mr-1" />
              )}
              {s.label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-[var(--color-fg-mute)]">
          El cron automático corre periódicamente (catálogo 24h, inventario 4h, performance 24h, returns 6h, Buy Box 24h, scan órdenes 30min).
        </p>
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  saving,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  saving: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-sm border bg-background p-3">
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{description}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {saving && <Loader2 size={12} className="animate-spin text-[var(--color-fg-mute)]" />}
        <Switch checked={checked} onCheckedChange={onChange} disabled={saving} />
      </div>
    </div>
  );
}
