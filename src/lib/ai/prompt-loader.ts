// Server-only loader: lee las versiones de prompts desde la tabla
// `prompt_versions` (Supabase). Para cada prompt_id retorna la versión activa
// + el historial completo, para que el visor pueda mostrar rollback.
//
// Reemplaza el reader anterior que leía los archivos .ts del filesystem.
// Ahora la source of truth es la DB; los archivos .ts solo tienen el
// fallback hardcoded por si la DB falla.

import "server-only";
import { createClient } from "@supabase/supabase-js";

export interface PromptVersionRow {
  id: string;
  version_label: string;
  content: string;
  model: string;
  max_tokens: number;
  description: string | null;
  is_active: boolean;
  created_by_email: string | null;
  created_at: string;
  activated_at: string | null;
  activated_by_email: string | null;
}

export interface PromptGroup {
  promptId: string;
  /** Nombre legible para humanos. */
  name: string;
  /** Descripción funcional de qué hace este prompt en el pipeline. */
  description: string;
  /** Dónde se usa en el código. */
  usedIn: string;
  /** Versión activa actualmente (siempre debería existir si el seed corrió). */
  active: PromptVersionRow | null;
  /** Todas las versiones, más reciente primero. Incluye la activa. */
  history: PromptVersionRow[];
}

const PROMPT_META: Record<string, Omit<PromptGroup, "active" | "history" | "promptId">> = {
  "system-extractor": {
    name: "PO Extractor — System Prompt",
    description:
      "Prompt principal del pipeline. Define rol, schema JSON de salida, reglas de campos, resolución de SKU, rúbrica de confianza y ejemplos few-shot. Se envía como bloque system de la llamada Sonnet — Anthropic lo cachea entre requests para abaratar costos.",
    usedIn: "supabase/functions/_shared/anthropic.ts (extractWithModel)",
  },
  "boundary-detection": {
    name: "Boundary Detection — Multi-PDF Splitter",
    description:
      "Detecta si un PDF contiene 1 o N documentos pegados. Solo se ejecuta para PDFs con > 1 página. Si detecta múltiples documentos, el pipeline hace fan-out: crea un documento hijo por cada rango de páginas.",
    usedIn: "supabase/functions/_shared/boundary-detection.ts (detectDocumentBoundaries)",
  },
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error("Supabase env vars missing in server runtime");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Carga el listado completo de prompts con su versión activa + historial.
 * Usado por el visor /settings/admin/ai/prompts.
 */
export async function loadPromptGroups(): Promise<PromptGroup[]> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("prompt_versions")
    .select(
      "id, prompt_id, version_label, content, model, max_tokens, description, is_active, created_by_email, created_at, activated_at, activated_by_email",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[prompt-loader] failed to read prompt_versions:", error.message);
    return [];
  }

  const grouped = new Map<string, PromptVersionRow[]>();
  for (const row of data ?? []) {
    const list = grouped.get(row.prompt_id) ?? [];
    list.push(row as PromptVersionRow);
    grouped.set(row.prompt_id, list);
  }

  return Object.keys(PROMPT_META).map((promptId) => {
    const history = grouped.get(promptId) ?? [];
    const active = history.find((v) => v.is_active) ?? null;
    return {
      promptId,
      ...PROMPT_META[promptId],
      active,
      history,
    };
  });
}
