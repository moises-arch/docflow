import {
  AlertCircle,
  BookOpen,
  Code2,
  FileText,
  Mail,
  Server,
  Zap,
} from "lucide-react";

export default function RithumDocumentacionPage() {
  return (
    <div>
      {/* Page header */}
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <div className="flex items-center gap-3">
          <BookOpen size={20} className="text-[var(--color-fg-mute)]" />
          <h1 className="text-base font-semibold text-[var(--color-fg)]">Documentación</h1>
        </div>
        <p className="mt-1.5 text-sm text-[var(--color-fg-mute)]">
          Referencia técnica de la integración Supplier Portal / Supplier Portal
        </p>
      </div>

      {/* Content */}
      <div className="px-6 py-6 space-y-8">

        {/* ── Cómo funciona ─────────────────────────────────────── */}
        <section className="grid gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
              <BookOpen size={15} className="text-[var(--color-fg-mute)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-fg)]">Cómo funciona</h2>
              <p className="text-xs text-[var(--color-fg-mute)]">Flujo end-to-end de la integración</p>
            </div>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
            {/* Pasos */}
            <div className="grid gap-2">
              {[
                {
                  n: 1,
                  icon: Mail,
                  title: "Orden en portal",
                  desc: "Retailer A envía el PO a Supplier Portal (Supplier Portal)",
                },
                {
                  n: 2,
                  icon: Mail,
                  title: "Email alert",
                  desc: "Supplier Portal notifica a orders@example.com con la lista de POs nuevas",
                },
                {
                  n: 3,
                  icon: Zap,
                  title: "Email pipeline",
                  desc: "Edge function email-ingest parsea el correo y dispatcha un job por cada fila",
                },
                {
                  n: 4,
                  icon: Server,
                  title: "Browser automation",
                  desc: "Runner Playwright hace login a dsm.commercehub.com, navega al detalle y captura el HTML",
                },
                {
                  n: 5,
                  icon: FileText,
                  title: "PDF + IA",
                  desc: "El HTML se renderiza a PDF; el pipeline de IA extrae líneas y crea un order_draft",
                },
              ].map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.n}
                    className="flex items-start gap-3 rounded-md border border-[var(--color-border)] bg-background px-4 py-3"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[10px] font-bold text-[var(--color-fg-mute)]">
                      {step.n}
                    </div>
                    <div className="flex items-start gap-2 min-w-0">
                      <Icon size={14} className="mt-0.5 shrink-0 text-[var(--color-fg-mute)]" />
                      <div>
                        <p className="text-xs font-semibold text-[var(--color-fg)]">{step.title}</p>
                        <p className="text-xs text-[var(--color-fg-mute)]">{step.desc}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ¿Por qué HTML render? */}
            <div className="rounded-md border border-[var(--color-border)] bg-amber-50/50 dark:bg-amber-950/20 p-3">
              <p className="text-xs font-semibold text-[var(--color-fg)] mb-1">
                ¿Por qué HTML render y no PDF nativo?
              </p>
              <p className="text-xs text-[var(--color-fg-mute)]">
                Supplier Portal no expone botón de descarga PDF en el detalle — el Action dropdown solo ofrece Cancel/Ship.
                DocFlow captura el HTML del detalle y lo renderiza a PDF. La URL del detalle persiste aunque el operador
                marque la orden como Shipped, así que DocFlow siempre puede recuperar los datos.
              </p>
            </div>

            {/* Scan cron */}
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-mute)] p-3">
              <p className="text-xs font-semibold text-[var(--color-fg)] mb-1">
                Scan cron (cada 15 min)
              </p>
              <p className="text-xs text-[var(--color-fg-mute)]">
                Como backup al trigger de email, un cron escanea el dashboard de Supplier Portal cada 15 minutos buscando
                órdenes que no llegaron por email (rate limits, errores de parseo, etc.). Las órdenes rescatadas
                quedan marcadas con <code className="font-mono">inbound_email_id = null</code> y son visibles en
                el desglose de origen del Resumen.
              </p>
            </div>
          </div>
        </section>

        {/* ── Estados y errores ─────────────────────────────────── */}
        <section className="grid gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
              <AlertCircle size={15} className="text-[var(--color-fg-mute)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-fg)]">Estados y errores</h2>
              <p className="text-xs text-[var(--color-fg-mute)]">Referencia de estados de órdenes y códigos de error</p>
            </div>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
            {/* Tabla de estados */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-mute)]">
                Estados de órdenes
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-[var(--color-border)] rounded-md overflow-hidden">
                  <thead className="bg-[var(--color-surface-mute)] text-[10px] uppercase text-[var(--color-fg-mute)]">
                    <tr>
                      <th className="px-3 py-2 text-left">Estado</th>
                      <th className="px-3 py-2 text-left">Descripción</th>
                      <th className="px-3 py-2 text-left">Qué hacer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { state: "pending", color: "bg-slate-500/10 text-slate-700 dark:text-slate-400", label: "pending", desc: "En cola para procesar", action: "Esperar" },
                      { state: "running", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400", label: "running", desc: "Playwright descargando", action: "Esperar" },
                      { state: "downloaded", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", label: "downloaded", desc: "PDF en storage, pipeline IA activo", action: "Verificar en inbox" },
                      { state: "failed", color: "bg-red-500/10 text-red-700 dark:text-red-400", label: "failed", desc: "Error en descarga", action: "Click Reintentar" },
                      { state: "manual_required", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400", label: "manual_required", desc: "Falla persistente (3+ intentos)", action: "Descargar manualmente del portal" },
                    ].map((row) => (
                      <tr key={row.state} className="border-t border-[var(--color-border)]">
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${row.color}`}>
                            {row.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[var(--color-fg-mute)]">{row.desc}</td>
                        <td className="px-3 py-2 text-[var(--color-fg-mute)]">{row.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabla de errores comunes */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-mute)]">
                Errores comunes
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-[var(--color-border)] rounded-md overflow-hidden">
                  <thead className="bg-[var(--color-surface-mute)] text-[10px] uppercase text-[var(--color-fg-mute)]">
                    <tr>
                      <th className="px-3 py-2 text-left">Código</th>
                      <th className="px-3 py-2 text-left">Causa</th>
                      <th className="px-3 py-2 text-left">Solución</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { code: "rithum_login_failed", cause: "Credenciales o Auth0 inaccesible", fix: "Reintentar en unos minutos" },
                      { code: "rithum_hub_po_not_found", cause: "PO no está en el portal o es muy antigua", fix: "Verificar en portal manualmente" },
                      { code: "chrome-error://chromewebdata/", cause: "Error de red transitorio", fix: "Reintentar automático (máx 2 veces)" },
                      { code: "rithum_html_capture_empty", cause: "Página de detalle sin widgets", fix: "Reintentar o subir manualmente" },
                      { code: "rithum_pdf_render_invalid", cause: "PDF corrupto en render", fix: "Reintentar" },
                    ].map((row) => (
                      <tr key={row.code} className="border-t border-[var(--color-border)]">
                        <td className="px-3 py-2">
                          <code className="font-mono text-[10px] text-red-600 dark:text-red-400">{row.code}</code>
                        </td>
                        <td className="px-3 py-2 text-[var(--color-fg-mute)]">{row.cause}</td>
                        <td className="px-3 py-2 text-[var(--color-fg-mute)]">{row.fix}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* ── Endpoints API ─────────────────────────────────────── */}
        <section className="grid gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
              <Code2 size={15} className="text-[var(--color-fg-mute)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-fg)]">Endpoints API</h2>
              <p className="text-xs text-[var(--color-fg-mute)]">Rutas disponibles para automatización e integración</p>
            </div>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
            <div className="grid gap-2">
              {[
                { method: "POST", path: "/api/ingest/rithum/process", desc: "Procesar una orden por PO Number", note: "token-protected" },
                { method: "POST", path: "/api/ingest/rithum/scan-stream", desc: "Scan SSE en tiempo real del dashboard", note: "" },
                { method: "POST", path: "/api/ingest/rithum/scan-pending", desc: "Scan sin streaming (para cron)", note: "" },
                { method: "POST", path: "/api/ingest/rithum/orders/[id]/retry", desc: "Reintentar orden fallida", note: "" },
                { method: "POST", path: "/api/ingest/rithum/orders/[id]/retry-stream", desc: "Retry con SSE", note: "" },
                { method: "POST", path: "/api/ingest/rithum/manual-dispatch", desc: "Despacho manual por PO", note: "" },
                { method: "POST", path: "/api/ingest/rithum/smoke", desc: "Smoke test de conectividad", note: "" },
                { method: "POST", path: "/api/ingest/rithum/deep-smoke", desc: "Smoke test completo con Playwright", note: "" },
              ].map((ep) => (
                <div
                  key={ep.path}
                  className="flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-background px-3 py-2"
                >
                  <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-400">
                    {ep.method}
                  </span>
                  <code className="min-w-0 truncate font-mono text-xs text-[var(--color-fg)]">{ep.path}</code>
                  <span className="ml-auto shrink-0 text-xs text-[var(--color-fg-mute)]">{ep.desc}</span>
                  {ep.note && (
                    <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                      {ep.note}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs text-[var(--color-fg-mute)] border-t border-[var(--color-border)] pt-3">
              Todos los endpoints requieren sesión activa de Supabase, excepto{" "}
              <code className="font-mono">/process</code> que usa el header{" "}
              <code className="font-mono">x-rithum-internal-token</code>.
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
