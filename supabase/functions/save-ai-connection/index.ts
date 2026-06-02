import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { encrypt } from "../_shared/crypto.ts";
import { secrets } from "../_shared/secrets.ts";

interface SavePayload {
  tenant_id?: string;
  provider?: string;
  primary_model?: string;
  api_key?: string;
  test_only?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANTHROPIC_PROVIDER = "anthropic";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function testAnthropic(apiKey: string, model: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        temperature: 0,
        messages: [{ role: "user", content: [{ type: "text", text: "Reply with OK" }] }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic validation failed (${res.status}) ${detail}`.trim());
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: SavePayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const tenantId = cleanText(payload.tenant_id);
  const provider = ANTHROPIC_PROVIDER;
  const primaryModel = ANTHROPIC_MODEL;
  const apiKey = cleanText(payload.api_key);
  const testOnly = payload.test_only === true;

  if (!tenantId || !UUID_RE.test(tenantId)) return json({ error: "Invalid tenant_id" }, 400);
  if (!apiKey) return json({ error: "api_key is required" }, 400);

  try {
    await testAnthropic(apiKey, primaryModel);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return json({ error: "Connection test failed", detail }, 422);
  }

  if (testOnly) {
    return json({ ok: true, status: "active" });
  }

  let apiKeyEnc: string;
  try {
    apiKeyEnc = await encrypt(apiKey, secrets.intakeSecretsKey);
  } catch (error) {
    if (secrets.anthropicApiKey) {
      apiKeyEnc = "__env__";
    } else {
      const detail = error instanceof Error ? error.message : String(error);
      return json({ error: "Failed to encrypt API key", detail }, 500);
    }
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("ai_connections").upsert(
    {
      tenant_id: tenantId,
      provider,
      primary_model: primaryModel,
      api_key_enc: apiKeyEnc,
      status: "active",
      settings: {
        configured_via: "settings.ai",
        updated_at: new Date().toISOString(),
      },
      last_checked_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    console.error("[save-ai-connection] upsert error", error);
    return json({ error: "Failed to save AI configuration" }, 500);
  }

  return json({ ok: true, status: "active" });
});
