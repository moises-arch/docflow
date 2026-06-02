"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  PauseCircle,
  Pencil,
  PlayCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { MimeTypePicker } from "@/components/app/mime-type-picker";

export type MsSource = {
  id: string;
  provider_id: string | null;
  address: string;
  status: "active" | "paused" | "archived";
  graph_subscription_id: string | null;
  graph_subscription_expires_at: string | null;
  allowed_mime_types: string[];
  created_at: string;
  last_error?: string | null;
  last_error_at?: string | null;
};

export type InboundEmail = {
  id: string;
  from_email: string;
  subject: string | null;
  state: string;
  received_at: string;
};

export type HealthCheckSummary = {
  ok: boolean;
  checks: Record<string, unknown>;
  error: string | null;
  created_at: string;
};

export type FailedMessageSummary = {
  count: number;
  max_attempts: number;
};

type ProviderOption = { id: string; name: string };

type Props = {
  sources: MsSource[];
  inboundEmails: InboundEmail[];
  providers: ProviderOption[];
  azureConfigured: boolean;
  healthBySource?: Record<string, HealthCheckSummary>;
  failedBySource?: Record<string, FailedMessageSummary>;
  messages24hBySource?: Record<string, number>;
};

export function EmailMicrosoftClient({
  sources,
  inboundEmails: _inboundEmails,
  providers,
  azureConfigured,
  healthBySource = {},
  failedBySource = {},
  messages24hBySource = {},
}: Props) {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(!azureConfigured || sources.length === 0);
  const [address, setAddress] = useState("");
  const [providerId, setProviderId] = useState("");
  const [allowedSenders, setAllowedSenders] = useState("");
  const [allowedMimeTypes, setAllowedMimeTypes] = useState<string[]>(["application/pdf"]);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMimes, setEditMimes] = useState<string[]>(["application/pdf"]);
  const [scanning, setScanning] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [renewing, setRenewing] = useState(false);

  async function runHealthcheck() {
    if (healthChecking) return;
    setHealthChecking(true);
    try {
      const r = await fetch("/api/cron/m365-healthcheck", { method: "POST" });
      const body = (await r.json().catch(() => null)) as {
        ok?: boolean; results?: Array<{ ok: boolean; address: string; error?: string }>;
        error?: string;
      } | null;
      if (r.ok) {
        const bad = (body?.results ?? []).filter((res) => !res.ok);
        if (bad.length === 0) toast.success("Healthcheck OK en todas las fuentes");
        else toast.error(`Healthcheck con fallos: ${bad.map((b) => b.address).join(", ")}`);
        router.refresh();
      } else {
        toast.error(`Healthcheck falló: ${body?.error ?? r.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fallo");
    } finally {
      setHealthChecking(false);
    }
  }

  async function runRenewAll() {
    if (renewing) return;
    setRenewing(true);
    try {
      const r = await fetch("/api/cron/m365-renew-subscriptions", { method: "POST" });
      const body = (await r.json().catch(() => null)) as {
        ok?: boolean; renewed?: number; results?: unknown[];
      } | null;
      if (r.ok && body?.ok) {
        toast.success(`Renovadas: ${body.renewed ?? 0}`);
        router.refresh();
      } else {
        toast.error(`Renovación falló: ${r.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fallo");
    } finally {
      setRenewing(false);
    }
  }

  async function addMailbox() {
    if (creating) return;
    if (!address.includes("@")) {
      toast.error("Ingresa una dirección de correo válida");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/ingest/email-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adapter: "microsoft_graph",
          address: address.trim(),
          provider_id: providerId || null,
          allowed_senders: allowedSenders,
          allowed_mime_types: allowedMimeTypes,
          graph_mailbox_id: address.trim(),
          graph_folder_id: "Inbox",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`No se pudo crear: ${body.error ?? res.status}`);
        return;
      }
      // Auto-connect right after creation so the user doesn't need a second click
      const sourceId = (body as { id?: string }).id;
      if (sourceId) {
        const sub = await fetch("/api/ingest/microsoft-graph/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_id: sourceId }),
        });
        if (!sub.ok) {
          const detail = await sub.json().catch(() => ({}));
          toast.error(
            `Mailbox creado, pero falló la conexión a Email provider: ${detail.error ?? sub.status}`,
          );
          router.refresh();
          return;
        }
      }
      toast.success("Mailbox conectado a Email provider");
      setAddress("");
      setProviderId("");
      setAllowedSenders("");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function connect(sourceId: string) {
    setBusyId(sourceId);
    try {
      const res = await fetch("/api/ingest/microsoft-graph/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`Conexión falló: ${body.error ?? res.status}`);
        return;
      }
      toast.success("Subscription renovada");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function scanInbox() {
    if (scanning) return;
    setScanning(true);
    try {
      const r = await fetch("/api/cron/m365-scan-inbox", { method: "POST" });
      const body = (await r.json().catch(() => null)) as {
        ok?: boolean; processed?: number; skipped?: number; errors?: string[];
      } | null;
      if (r.ok && body?.ok) {
        if (body.processed === 0) toast.success(`Inbox escaneado — ${body.skipped ?? 0} ya procesados, sin emails nuevos`);
        else toast.success(`${body.processed} email(s) recuperados del inbox`);
      } else {
        toast.error(`Scan falló: ${body?.errors?.[0] ?? r.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fallo");
    } finally {
      setScanning(false);
    }
  }

  function startEdit(source: MsSource) {
    setEditingId(source.id);
    setEditMimes(source.allowed_mime_types.length > 0 ? source.allowed_mime_types : ["application/pdf"]);
  }

  async function saveFormats(sourceId: string) {
    setBusyId(sourceId);
    try {
      const res = await fetch(`/api/ingest/email-sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed_mime_types: editMimes }),
      });
      if (res.ok) {
        toast.success("Formatos guardados");
        setEditingId(null);
        router.refresh();
      } else {
        toast.error("No se pudo guardar");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(sourceId: string, status: "active" | "paused") {
    setBusyId(sourceId);
    try {
      const res = await fetch(`/api/ingest/email-sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success("Actualizado");
        router.refresh();
      } else {
        toast.error("No se pudo actualizar");
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <div className="flex items-center gap-3">
          <Mail size={20} className="text-blue-600" />
          <h1 className="text-base font-semibold">Email provider</h1>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              azureConfigured
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {azureConfigured ? "Azure configurado" : "Azure pendiente"}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--color-fg-mute)]">
          Conecta buzones de Outlook / Exchange Online con Email provider API
        </p>
      </div>

      <div className="px-6 py-6">
      <div className="grid gap-4">
      {!azureConfigured && (
        <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Falta configurar Azure AD.</strong> Antes de agregar un mailbox necesitas
          registrar una app en Microsoft Entra ID y dejar 3 variables de entorno en el servidor:{" "}
          <code>MICROSOFT_GRAPH_TENANT_ID</code>, <code>MICROSOFT_GRAPH_CLIENT_ID</code> y{" "}
          <code>MICROSOFT_GRAPH_CLIENT_SECRET</code>. Sigue la guía abajo (toma ~5 min).
        </div>
      )}

      {/* Step 1 — Setup walkthrough */}
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                azureConfigured
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {azureConfigured ? <CheckCircle2 size={14} /> : "1"}
            </span>
            <span className="text-sm font-semibold">
              Configurar Azure AD {azureConfigured ? "(listo)" : "(una sola vez)"}
            </span>
          </div>
          {showHelp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showHelp && (
          <div className="border-t border-[var(--color-border)] p-4 text-sm">
            <p className="mb-3 text-[var(--color-fg-mute)]">
              Esto registra una "app" dentro de Microsoft que tiene permiso para leer correos del
              buzón. Lo haces UNA vez para todo el tenant; después agregas todos los buzones que
              quieras.
            </p>
            <ol className="ml-5 grid list-decimal gap-2 text-sm">
              <li>
                Abre{" "}
                <a
                  className="text-blue-600 underline"
                  href="https://portal.azure.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  portal.azure.com
                </a>{" "}
                con una cuenta admin del tenant.
              </li>
              <li>
                Microsoft Entra ID → <strong>App registrations</strong> →{" "}
                <strong>New registration</strong>.
              </li>
              <li>
                Name: <code>Intake Email Ingest</code>. Account types:{" "}
                <strong>Single tenant</strong>. Redirect URI: déjalo vacío. Click{" "}
                <strong>Register</strong>.
              </li>
              <li>
                En la pestaña <strong>Overview</strong> copia <em>Application (client) ID</em> y{" "}
                <em>Directory (tenant) ID</em>.
              </li>
              <li>
                <strong>Certificates &amp; secrets</strong> → New client secret → Description{" "}
                <code>Intake</code>, Expires <code>24 months</code> →{" "}
                <strong>copia el "Value"</strong> (no el Secret ID; sólo se muestra una vez).
              </li>
              <li>
                <strong>API permissions</strong> → Add a permission → Email provider →{" "}
                <strong>Application permissions</strong> → marca <code>Mail.Read</code> y{" "}
                <code>Mail.ReadBasic</code> → Add. Después click{" "}
                <strong>Grant admin consent</strong> (botón azul).
              </li>
              <li>
                Pasa los 3 valores al servidor:
                <pre className="mt-1 overflow-x-auto rounded bg-[var(--color-bg)] p-2 text-xs">
                  {`# Vercel
pnpm exec vercel env add MICROSOFT_GRAPH_TENANT_ID production
pnpm exec vercel env add MICROSOFT_GRAPH_CLIENT_ID production
pnpm exec vercel env add MICROSOFT_GRAPH_CLIENT_SECRET production
pnpm exec vercel deploy --prod

# Supabase Edge Functions
pnpm exec supabase secrets set \\
  MICROSOFT_GRAPH_TENANT_ID=<tenant-id> \\
  MICROSOFT_GRAPH_CLIENT_ID=<client-id> \\
  MICROSOFT_GRAPH_CLIENT_SECRET=<value>`}
                </pre>
              </li>
            </ol>
          </div>
        )}
      </section>

      {/* Step 2 — Add mailbox */}
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-fg)] text-xs font-semibold text-[var(--color-bg)]">
            2
          </span>
          <h2 className="text-sm font-semibold">Agregar un buzón</h2>
        </div>
        <p className="mb-3 text-xs text-[var(--color-fg-mute)]">
          Pega la dirección del buzón que quieres ingestar. La conexión a Email provider se hace
          automáticamente al guardar y se renueva sola cada 6 horas.
        </p>
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <Field label="Dirección del buzón">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="orders@example.com"
              disabled={creating}
            />
          </Field>
          <Field label="Provider (opcional)">
            <select
              className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              disabled={creating}
            >
              <option value="">Auto-detectar</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={addMailbox}
              disabled={creating}
              className="w-full md:w-auto"
            >
              {creating ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
              Agregar y conectar
            </Button>
          </div>
          <Field
            label="Remitentes permitidos (opcional)"
            hint="Coma-separados. Vacío = aceptar a cualquiera. Ej: *@walmart.com, ops@partner.com"
          >
            <Input
              value={allowedSenders}
              onChange={(e) => setAllowedSenders(e.target.value)}
              placeholder="*@partner.com"
              disabled={creating}
            />
          </Field>
          <div className="md:col-span-3">
            <Field
              label="Formatos aceptados"
              hint="Solo estos archivos pasan al pipeline de IA. PDF es el default — bloquea firmas .txt/.html y ahorra tokens."
            >
              <MimeTypePicker
                value={allowedMimeTypes}
                onChange={setAllowedMimeTypes}
                disabled={creating}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* Step 3 — Connected mailboxes */}
      {sources.length > 0 && (
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 size={14} />
                </span>
                <h2 className="text-sm font-semibold">Buzones conectados</h2>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={runHealthcheck}
                  disabled={healthChecking}
                  title="Verifica token, suscripción real en Microsoft, y listing del inbox"
                >
                  {healthChecking ? (
                    <Loader2 size={14} className="mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} className="mr-1" />
                  )}
                  Verificar salud
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={runRenewAll}
                  disabled={renewing}
                  title="Dispara la renovación de suscripciones manualmente"
                >
                  {renewing ? (
                    <Loader2 size={14} className="mr-1 animate-spin" />
                  ) : (
                    <RefreshCw size={14} className="mr-1" />
                  )}
                  Renovar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={scanInbox}
                  disabled={scanning}
                  title="Escanea el inbox de los últimos 3 días y recupera emails que no entraron por notificación. También reintenta mensajes fallidos."
                >
                  {scanning ? (
                    <Loader2 size={14} className="mr-1 animate-spin" />
                  ) : (
                    <RefreshCw size={14} className="mr-1" />
                  )}
                  Escanear inbox
                </Button>
              </div>
            </div>
            <p className="mt-1 text-xs text-[var(--color-fg-mute)]">
              Un cron renueva las suscripciones cada 6h automáticamente. Usa{" "}
              <em>Escanear inbox</em> para recuperar emails perdidos de los últimos 3 días.
            </p>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {sources.map((source) => {
              const expiresAt = source.graph_subscription_expires_at
                ? new Date(source.graph_subscription_expires_at)
                : null;
              const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;
              const connected = !!source.graph_subscription_id && !expired;
              const isEditing = editingId === source.id;
              const health = healthBySource[source.id];
              const failed = failedBySource[source.id];
              const msgs24h = messages24hBySource[source.id] ?? 0;
              const renewIn = expiresAt
                ? Math.max(0, expiresAt.getTime() - Date.now() - 36 * 60 * 60 * 1000)
                : 0;
              const healthTone = !health
                ? "bg-[var(--color-surface-mute)] text-[var(--color-fg-mute)]"
                : health.ok
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700";
              return (
                <div key={source.id}>
                  {/* Fila principal */}
                  <div className="grid items-center gap-3 p-4 md:grid-cols-[minmax(200px,1fr)_180px_auto]">
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        <Mail size={14} className="text-[var(--color-fg-mute)]" />
                        <span>{source.address}</span>
                      </div>
                      <div className="mt-1 text-xs text-[var(--color-fg-mute)]">
                        {connected ? (
                          <span>
                            Conectado · expira{" "}
                            {expiresAt!.toLocaleString("es-MX", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        ) : source.graph_subscription_id ? (
                          <span className="text-amber-700">Suscripción expirada — reconecta</span>
                        ) : (
                          <span className="text-amber-700">Sin suscripción</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                          source.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {source.status === "active" ? (
                          <CheckCircle2 size={12} />
                        ) : (
                          <PauseCircle size={12} />
                        )}
                        {source.status === "active" ? "Activo" : "Pausado"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => connect(source.id)}
                        disabled={busyId === source.id}
                      >
                        {busyId === source.id ? (
                          <Loader2 size={14} className="mr-1 animate-spin" />
                        ) : (
                          <RefreshCw size={14} className="mr-1" />
                        )}
                        {connected ? "Renovar" : "Reconectar"}
                      </Button>
                      {source.status === "active" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setStatus(source.id, "paused")}
                          disabled={busyId === source.id}
                        >
                          <PauseCircle size={14} className="mr-1" />
                          Pausar
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setStatus(source.id, "active")}
                          disabled={busyId === source.id}
                        >
                          <PlayCircle size={14} className="mr-1" />
                          Reanudar
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => isEditing ? setEditingId(null) : startEdit(source)}
                      >
                        {isEditing ? <X size={14} className="mr-1" /> : <Pencil size={14} className="mr-1" />}
                        {isEditing ? "Cancelar" : "Formatos"}
                      </Button>
                    </div>
                  </div>

                  {/* Estado de salud */}
                  <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-mute)] px-4 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${healthTone}`}>
                        {health ? (health.ok ? "Salud OK" : "Salud fallida") : "Sin healthcheck"}
                      </span>
                      {health && (
                        <span className="text-[var(--color-fg-mute)]">
                          Verificado: {new Date(health.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      )}
                      <span className="text-[var(--color-fg-mute)]">
                        Emails 24h: <strong className="text-[var(--color-fg)]">{msgs24h}</strong>
                      </span>
                      {failed && failed.count > 0 && (
                        <span className="text-amber-700">
                          Fallidos 24h: <strong>{failed.count}</strong> (max intentos: {failed.max_attempts})
                        </span>
                      )}
                      {expiresAt && (
                        <span className="text-[var(--color-fg-mute)]">
                          Próx. renovación: {renewIn === 0 ? "ahora" : `en ~${Math.round(renewIn / (60 * 60 * 1000))}h`}
                        </span>
                      )}
                    </div>
                    {health?.error && (
                      <div className="mt-1 text-red-700">Error: {health.error}</div>
                    )}
                    {source.last_error && (
                      <div className="mt-1 text-amber-700">
                        Último error de renovación: {source.last_error}
                        {source.last_error_at && (
                          <span className="ml-1 text-[var(--color-fg-mute)]">
                            ({new Date(source.last_error_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })})
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Panel de edición de formatos */}
                  {isEditing && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-mute)] px-4 py-4">
                      <p className="mb-2 text-xs font-medium text-[var(--color-fg-mute)]">
                        Formatos aceptados para <strong>{source.address}</strong>
                      </p>
                      <MimeTypePicker value={editMimes} onChange={setEditMimes} />
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => saveFormats(source.id)}
                          disabled={busyId === source.id}
                        >
                          {busyId === source.id ? (
                            <Loader2 size={13} className="mr-1 animate-spin" />
                          ) : null}
                          Guardar formatos
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint ? <span className="text-xs text-[var(--color-fg-mute)]">{hint}</span> : null}
    </div>
  );
}
