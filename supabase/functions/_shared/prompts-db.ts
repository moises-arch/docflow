//
// Loader que lee la versión activa de un prompt desde la tabla `prompt_versions`.
// Cachea in-memory por TTL para evitar query Supabase en cada request.
//
// Las edge functions son ephemeral — entre invocaciones el caché se pierde.
// Pero dentro de una misma invocación (procesamiento de 1 documento con N
// llamadas Anthropic), reutiliza el caché.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface CachedPrompt {
  content: string;
  model: string;
  maxTokens: number;
  versionLabel: string;
  expiresAt: number;
}

const CACHE: Map<string, CachedPrompt> = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 minutos

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) {
    throw new Error("Supabase env vars missing for prompts-db loader");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface ActivePrompt {
  content: string;
  model: string;
  maxTokens: number;
  versionLabel: string;
}

/**
 * Devuelve la versión activa del prompt. Cachea por 5 min. Si la query falla
 * o no hay versión activa, devuelve null — el caller decide qué hacer
 * (fallback al hardcoded típicamente).
 */
export async function getActivePrompt(promptId: string): Promise<ActivePrompt | null> {
  const cached = CACHE.get(promptId);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      content: cached.content,
      model: cached.model,
      maxTokens: cached.maxTokens,
      versionLabel: cached.versionLabel,
    };
  }

  try {
    const supabase = adminClient();
    const { data, error } = await supabase
      .from("prompt_versions")
      .select("content, model, max_tokens, version_label")
      .eq("prompt_id", promptId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error(`[prompts-db] query failed for ${promptId}:`, error.message);
      return null;
    }
    if (!data) {
      console.warn(`[prompts-db] no active version for ${promptId}`);
      return null;
    }

    const active: ActivePrompt = {
      content: String(data.content),
      model: String(data.model),
      maxTokens: Number(data.max_tokens),
      versionLabel: String(data.version_label),
    };
    CACHE.set(promptId, { ...active, expiresAt: Date.now() + TTL_MS });
    return active;
  } catch (err) {
    console.error(`[prompts-db] unexpected error for ${promptId}:`, err);
    return null;
  }
}

/** Útil para tests / debug. */
export function clearPromptCache(): void {
  CACHE.clear();
}
