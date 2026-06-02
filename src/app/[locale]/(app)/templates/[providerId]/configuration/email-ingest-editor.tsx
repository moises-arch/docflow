"use client";

import { useState } from "react";
import { FileCode2, Info, Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface EmailIngestEditorProps {
  providerId: string;
  initialConfig: {
    process_html_body: boolean;
    packing_slip_filename_patterns: string[];
  };
}

export function EmailIngestEditor({ providerId, initialConfig }: EmailIngestEditorProps) {
  const [processHtml, setProcessHtml] = useState(initialConfig.process_html_body);
  const [patterns, setPatterns] = useState<string[]>(initialConfig.packing_slip_filename_patterns);
  const [patternInput, setPatternInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function save(nextProcessHtml = processHtml, nextPatterns = patterns) {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/providers/${providerId}/email-ingest`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          process_html_body: nextProcessHtml,
          packing_slip_filename_patterns: nextPatterns,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setDirty(false);
      toast.success("Email ingest settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function toggleProcessHtml() {
    const next = !processHtml;
    setProcessHtml(next);
    setDirty(true);
  }

  function addPattern() {
    const trimmed = patternInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!trimmed || patterns.includes(trimmed)) {
      setPatternInput("");
      return;
    }
    const next = [...patterns, trimmed];
    setPatterns(next);
    setPatternInput("");
    setDirty(true);
  }

  function removePattern(pattern: string) {
    const next = patterns.filter((p) => p !== pattern);
    setPatterns(next);
    setDirty(true);
  }

  const isActive = processHtml || patterns.length > 0;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)]">
            <FileCode2 size={15} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-subtle)]">
              Email Ingest Rules
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
              Behavior especial cuando un email de este proveedor llega al inbox.
            </p>
          </div>
        </div>

        {/* Status pill */}
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            isActive
              ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
              : "bg-[var(--color-border)] text-[var(--color-fg-mute)]",
          )}
        >
          {isActive ? "Activo" : "Default"}
        </span>
      </div>

      <div className="space-y-5">
        {/* Toggle: Process HTML body */}
        <div className="flex items-start justify-between gap-4 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-fg)]">
              Procesar cuerpo HTML como documento
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
              El cuerpo del email (HTML) se convierte en documento y entra al pipeline de AI,
              incluso si ya hay adjuntos PDF. Úsalo cuando el proveedor envía el PO directamente
              en el email (no como adjunto).
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={processHtml}
            onClick={toggleProcessHtml}
            className={cn(
              "relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors",
              processHtml ? "bg-violet-500" : "bg-[var(--color-border)]",
            )}
          >
            <span
              className={cn(
                "inline-block size-3.5 rounded-full bg-white shadow transition-transform",
                processHtml ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </button>
        </div>

        {/* Packing slip filename patterns */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-medium text-[var(--color-fg)]">
              Patrones de nombre — Packing Slip
            </p>
            <div className="group relative">
              <Info size={12} className="text-[var(--color-fg-subtle)] cursor-help" />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 text-xs text-[var(--color-fg-mute)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                Nombres de archivo (sin extensión) que identifican adjuntos como packing slip.
                Se normalizan automáticamente (minúsculas, sin símbolos).
                Ej: <strong>packingslip</strong>, <strong>packing</strong>, <strong>slip</strong>
              </div>
            </div>
          </div>
          <p className="mb-3 text-xs text-[var(--color-fg-mute)]">
            Adjuntos cuyo nombre de archivo contenga alguno de estos patrones serán guardados
            como <strong>packing slip</strong> y enviados automáticamente al campo{" "}
            <code className="rounded bg-[var(--color-surface-mute)] px-1 py-0.5 font-mono text-[10px]">
              csf_packing_list_attachment_id
            </code>{" "}
            del Sale Order en ERP (COF).
          </p>

          {/* Tags */}
          <div className="mb-2 flex min-h-8 flex-wrap gap-1.5">
            {patterns.length === 0 ? (
              <span className="text-xs italic text-[var(--color-fg-subtle)]">
                Sin patrones — todos los adjuntos entran al pipeline normal
              </span>
            ) : (
              patterns.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-1 text-xs font-mono font-medium text-violet-600 dark:text-violet-400"
                >
                  *{p}*
                  <button
                    type="button"
                    onClick={() => removePattern(p)}
                    disabled={saving}
                    className="text-violet-400 hover:text-violet-600 transition-colors disabled:opacity-40"
                    aria-label={`Remove ${p}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Add pattern input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={patternInput}
              onChange={(e) => setPatternInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPattern();
                }
              }}
              placeholder="ej: packingslip, packing, slip…"
              className={cn(
                "h-8 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]",
                "px-2.5 text-sm text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-subtle)]",
                "focus:border-[var(--color-fg)] transition-colors font-mono",
              )}
            />
            <button
              type="button"
              onClick={addPattern}
              disabled={!patternInput.trim()}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)]",
                "bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-fg)] transition-colors",
                "hover:bg-[var(--color-surface-mute)] disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              <Plus size={13} />
              Agregar
            </button>
          </div>
        </div>
      </div>

      {/* Footer: info + save button */}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
        <p className="text-[11px] text-[var(--color-fg-subtle)]">
          {isActive
            ? "Esta configuración solo aplica a emails de este proveedor."
            : "Comportamiento estándar — igual que todos los demás proveedores."}
        </p>
        <button
          type="button"
          onClick={() => save()}
          disabled={saving || !dirty}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-medium transition-colors",
            dirty
              ? "bg-[var(--color-fg)] text-[var(--color-bg)] hover:opacity-80"
              : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-mute)] opacity-50 cursor-not-allowed",
          )}
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Save size={13} />
          )}
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
