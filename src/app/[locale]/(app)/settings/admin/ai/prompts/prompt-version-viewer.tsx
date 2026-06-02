"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, Copy, History, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { PromptGroup, PromptVersionRow } from "@/lib/ai/prompt-loader";

export function PromptVersionViewer({ group }: { group: PromptGroup }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    group.active?.id ?? group.history[0]?.id ?? null,
  );
  const [copied, setCopied] = useState(false);
  const [pendingRollback, startRollback] = useTransition();

  const selected = useMemo<PromptVersionRow | null>(() => {
    if (!selectedId) return null;
    return group.history.find((v) => v.id === selectedId) ?? null;
  }, [group.history, selectedId]);

  async function onCopy() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function onRollback(version: PromptVersionRow) {
    if (version.is_active) return;
    const confirmed = window.confirm(
      `¿Activar la versión ${version.version_label} del prompt "${group.name}"?\n\n` +
        `La versión activa actual (${group.active?.version_label ?? "—"}) quedará en el historial.\n\n` +
        "Los siguientes documentos procesados usarán esta versión (el caché tarda hasta 5 min en refrescarse).",
    );
    if (!confirmed) return;

    startRollback(async () => {
      try {
        const res = await fetch("/api/admin/prompts/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt_id: group.promptId,
            version_label: version.version_label,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(`No se pudo activar: ${body.error ?? res.status}`);
          return;
        }
        toast.success(`Versión ${version.version_label} activada`);
        router.refresh();
      } catch {
        toast.error("Error de red al activar la versión");
      }
    });
  }

  const active = group.active;
  const lineCount = selected ? selected.content.split("\n").length : 0;
  const charCount = selected ? selected.content.length : 0;

  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Header — siempre visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg)]/50"
      >
        <span className="mt-0.5 text-[var(--color-fg-mute)]">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-semibold text-[var(--color-fg)]">{group.name}</h3>
            {active && (
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Activa: {active.version_label}
              </span>
            )}
            {active && (
              <span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-fg-mute)]">
                {active.model}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-fg-mute)]">
              <History size={9} aria-hidden="true" />
              {group.history.length} {group.history.length === 1 ? "versión" : "versiones"}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-fg-mute)]">{group.description}</p>
          <p className="mt-1 font-mono text-[10px] text-[var(--color-fg-subtle)]">
            {group.usedIn}
          </p>
        </div>
      </button>

      {/* Cuerpo expandible */}
      {expanded && (
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          {group.history.length === 0 ? (
            <p className="text-xs text-[var(--color-fg-mute)]">
              No hay versiones registradas en <code>prompt_versions</code> para este prompt.
              Aplicá las migrations de seed.
            </p>
          ) : (
            <>
              {/* Tabla de versiones */}
              <div className="mb-3 overflow-x-auto rounded border border-[var(--color-border)]">
                <table className="w-full text-[11px]">
                  <thead className="bg-[var(--color-bg)] text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)]">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold">Versión</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Estado</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Modelo</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Creada</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Descripción</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.history.map((v) => {
                      const isSelected = v.id === selectedId;
                      return (
                        <tr
                          key={v.id}
                          className={cn(
                            "border-t border-[var(--color-border)] transition-colors",
                            isSelected ? "bg-[var(--color-bg)]" : "hover:bg-[var(--color-bg)]/50",
                          )}
                        >
                          <td className="px-2 py-1.5 font-mono font-semibold text-[var(--color-fg)]">
                            {v.version_label}
                          </td>
                          <td className="px-2 py-1.5">
                            {v.is_active ? (
                              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                Activa
                              </span>
                            ) : (
                              <span className="text-[10px] text-[var(--color-fg-mute)]">Histórica</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-[var(--color-fg-mute)]">
                            {v.model}
                          </td>
                          <td className="px-2 py-1.5 text-[10px] text-[var(--color-fg-mute)]">
                            {new Date(v.created_at).toLocaleDateString()}
                          </td>
                          <td className="max-w-[280px] truncate px-2 py-1.5 text-[10px] text-[var(--color-fg-mute)]">
                            {v.description ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setSelectedId(v.id)}
                                className={cn(
                                  "rounded px-2 py-0.5 text-[10px] font-medium",
                                  isSelected
                                    ? "bg-[var(--color-fg)] text-[var(--color-bg)]"
                                    : "text-[var(--color-fg-mute)] hover:bg-[var(--color-border)] hover:text-[var(--color-fg)]",
                                )}
                              >
                                Ver
                              </button>
                              {!v.is_active && (
                                <button
                                  type="button"
                                  onClick={() => onRollback(v)}
                                  disabled={pendingRollback}
                                  className="inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-400/20 disabled:opacity-50 dark:text-amber-300"
                                  title="Activar esta versión (rollback)"
                                >
                                  {pendingRollback ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <RotateCcw size={10} />
                                  )}
                                  Activar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Visor de la versión seleccionada */}
              {selected && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[10px] text-[var(--color-fg-mute)]">
                      <span className="font-semibold uppercase tracking-wider">
                        Contenido — {selected.version_label}
                      </span>
                      <span>·</span>
                      <span className="font-mono">max_tokens: {selected.max_tokens}</span>
                      <span>·</span>
                      <span className="font-mono">
                        {lineCount} líneas · {charCount.toLocaleString()} chars
                      </span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={onCopy} className="gap-1">
                      {copied ? <Check size={11} /> : <Copy size={11} />}
                      {copied ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                  <pre className="mt-1.5 max-h-[600px] overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-fg)] whitespace-pre-wrap break-words">
                    {selected.content}
                  </pre>
                </>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
