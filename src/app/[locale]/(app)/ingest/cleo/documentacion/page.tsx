import Image from "next/image";
import {
  AlertCircle,
  BookOpen,
  Code2,
  FileText,
  Mail,
  Server,
  Zap,
} from "lucide-react";

export default function CleoDocumentacionPage() {
  return (
    <div>
      {/* Page header */}
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <div className="flex items-center gap-3">
          <Image src="/connector-logo.svg" alt="Supplier Portal" width={110} height={32} className="h-8 w-auto" />
          <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-fg)]">
            <BookOpen size={15} className="text-[var(--color-fg-mute)]" />
            Documentación
          </span>
        </div>
        <p className="mt-1.5 text-sm text-[var(--color-fg-mute)]">
          Referencia técnica de la integración Supplier Portal
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
                  title: "Trading partner envía PO 850",
                  desc: "Marketplace, Sam's Club, Retailer C u otro trading partner envía su Purchase Order 850 al portal Supplier Portal en portal.example.com.",
                },
                {
                  n: 2,
                  icon: Mail,
                  title: "Email de notificación Supplier Portal",
                  desc: "Supplier Portal envía automáticamente un correo a orders@example.com con una tabla HTML que contiene el Message ID de cada orden recibida.",
                },
                {
                  n: 3,
                  icon: Zap,
                  title: "Edge function parsea la tabla",
                  desc: "La edge function email-ingest detecta la notificación, parsea la tabla EDI, filtra filas con Document=850, y dispatcha un job por cada Message ID.",
                },
                {
                  n: 4,
                  icon: Server,
                  title: "Runner Playwright descarga el PDF",
                  desc: "El runner en Vercel hace login a portal.example.com, llama WEBEDI.doc.printDocument(messageId), renderiza el HTML a PDF con Chromium y lo descarga.",
                },
                {
                  n: 5,
                  icon: FileText,
                  title: "PDF → pipeline IA → ERP",
                  desc: "El PDF entra al pipeline de IA que extrae líneas, cantidades y precios para crear un order_draft sincronizable con ERP.",
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

            {/* ¿Por qué email trigger? */}
            <div className="rounded-md border border-[var(--color-border)] bg-amber-50/50 dark:bg-amber-950/20 p-3">
              <p className="text-xs font-semibold text-[var(--color-fg)] mb-1">
                ¿Por qué trigger por email y no por cron?
              </p>
              <p className="text-xs text-[var(--color-fg-mute)]">
                Supplier Portal no marca los mensajes como "leídos" si otro usuario abre la orden en el
                portal — un cron basado en estado se perdería esas órdenes. Usar el correo como
                trigger garantiza que cada notificación se procese exactamente una vez
                (idempotencia por <code className="font-mono">cleo_message_id</code>). Además,
                el portal Supplier Portal no expone un API REST público; el único canal fiable para detectar
                nuevas órdenes es la notificación por email.
              </p>
            </div>
          </div>
        </section>

        {/* ── Filtros aplicados ─────────────────────────────────── */}
        <section className="grid gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
              <Zap size={15} className="text-[var(--color-fg-mute)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-fg)]">Filtros aplicados</h2>
              <p className="text-xs text-[var(--color-fg-mute)]">Criterios de selección y descarte de notificaciones</p>
            </div>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
            <ul className="grid gap-2 text-xs text-[var(--color-fg-mute)]">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-mono text-emerald-600">✓</span>
                Solo se procesan filas con <code className="font-mono">Document = "850"</code> (Purchase Orders).
                Tipos 855, 856, 997, 820 u otros se ignoran completamente.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-mono text-emerald-600">✓</span>
                Idempotencia por <code className="font-mono">cleo_message_id</code>: si el mismo Message ID
                ya está en <code className="font-mono">cleo_orders</code> con state=downloaded, el job retorna
                sin procesarlo nuevamente.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-mono text-emerald-600">✓</span>
                Las notificaciones de Supplier Portal ya no crean documentos HTML basura en el Inbox — el email-ingest
                detecta el sender (<code className="font-mono">datatrans-inc.com</code>) y lo despacha directamente
                como job Supplier Portal.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-mono text-emerald-600">✓</span>
                Archivos adjuntos inline (firmas de Outlook, imágenes decorativas) se descartan automáticamente.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-mono text-amber-600">⚠</span>
                "Procesar pendientes" también escanea el inbox buscando notificaciones HTML que llegaron
                antes de que el detector estuviera activo, y las procesa retroactivamente.
              </li>
            </ul>
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
                      { state: "running", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400", label: "running", desc: "Playwright descargando el PDF del portal", action: "Esperar" },
                      { state: "downloaded", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", label: "downloaded", desc: "PDF en storage, pipeline IA activo", action: "Verificar en inbox" },
                      { state: "failed", color: "bg-red-500/10 text-red-700 dark:text-red-400", label: "failed", desc: "Error en descarga o login", action: "Click Reintentar" },
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
                      { code: "cleo_credentials_missing", cause: "CLEO_USERNAME o CLEO_PASSWORD no configurados", fix: "Actualizar env vars en Vercel" },
                      { code: "cleo_login_failed", cause: "Credenciales incorrectas o portal no accesible", fix: "Verificar CLEO_PASSWORD, reintentar en unos minutos" },
                      { code: "cleo_pdf_download_failed", cause: "printDocument() devolvió error o sesión inválida", fix: "Reintentar — suele ser transitorio" },
                      { code: "cleo_pdf_empty", cause: "PDF generado tiene 0 bytes", fix: "Reintentar" },
                      { code: "cleo_print_html_missing", cause: "printDocument() devolvió HTML vacío o nulo", fix: "Reintentar o verificar el Message ID en el portal" },
                      { code: "cleo_storage_upload_failed", cause: "Error de Supabase Storage al subir el PDF", fix: "Reintentar" },
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
                { method: "POST", path: "/api/ingest/cleo/process", desc: "Runner token-protected — procesar un job Supplier Portal", note: "token-protected" },
                { method: "POST", path: "/api/ingest/cleo/scan-pending", desc: "Procesar notificaciones pendientes del inbox (sin streaming)", note: "" },
                { method: "POST", path: "/api/ingest/cleo/scan-stream", desc: "Scan con logs SSE en tiempo real", note: "" },
                { method: "POST", path: "/api/ingest/cleo/smoke", desc: "Health check — verifica env vars, portal y runner", note: "" },
                { method: "POST", path: "/api/ingest/cleo/orders/[id]/retry", desc: "Reintentar una orden fallida", note: "" },
                { method: "POST", path: "/api/ingest/cleo/orders/[id]/retry-stream", desc: "Retry con logs SSE en tiempo real", note: "" },
                { method: "POST", path: "/api/ingest/cleo/orders/[id]/apply-parsed", desc: "Re-aplica payload parseado a order_draft existente", note: "" },
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
              <code className="font-mono">x-cleo-internal-token</code>.
            </p>
          </div>
        </section>

        {/* ── Configuración actual ──────────────────────────────── */}
        <section className="grid gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
              <Mail size={15} className="text-[var(--color-fg-mute)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-fg)]">Configuración actual</h2>
              <p className="text-xs text-[var(--color-fg-mute)]">Credenciales, portal y filtros activos</p>
            </div>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <dl className="grid gap-2 text-xs">
              {[
                { label: "Trigger", value: <>Correos a <code className="font-mono">orders@example.com</code></> },
                { label: "Portal", value: <a className="text-blue-600 hover:underline" href="https://portal.example.com/webedi/view/home" target="_blank" rel="noreferrer">portal.example.com</a> },
                { label: "Filtro", value: "Document = 850 (Purchase Orders únicamente)" },
                { label: "Cuenta", value: "DocFlow" },
                { label: "Credenciales", value: <><code className="font-mono">CLEO_USERNAME</code> + <code className="font-mono">CLEO_PASSWORD</code> — env vars en Vercel</> },
                { label: "Token runner", value: <><code className="font-mono">INTAKE_CLEO_INTERNAL_TOKEN</code> — protege el endpoint /process</> },
              ].map((row) => (
                <div key={row.label} className="grid grid-cols-[140px_1fr] items-baseline gap-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-fg-mute)]">
                    {row.label}
                  </dt>
                  <dd className="text-[var(--color-fg-mute)]">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

      </div>
    </div>
  );
}
