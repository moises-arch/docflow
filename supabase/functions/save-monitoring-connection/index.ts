import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { encrypt } from "../_shared/crypto.ts";
import { secrets } from "../_shared/secrets.ts";

interface SavePayload {
  tenant_id?: string;
  api_key?: string;
  test_only?: boolean;
}

interface UptimeRobotAccount {
  email?: string;
}

interface UptimeRobotResponse {
  stat?: string;
  account?: UptimeRobotAccount;
  error?: { type?: string; message?: string };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER = "uptimerobot";

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function testUptimeRobot(apiKey: string): Promise<UptimeRobotAccount> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch("https://api.uptimerobot.com/v2/getAccountDetails", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "cache-control": "no-cache",
      },
      body: `api_key=${encodeURIComponent(apiKey)}&format=json`,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const body = (await res.json().catch(() => null)) as UptimeRobotResponse | null;
  if (!res.ok || !body || body.stat !== "ok") {
    const message = body?.error?.message ?? `UptimeRobot validation failed (${res.status})`;
    throw new Error(message);
  }
  return body.account ?? {};
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
  const apiKey = cleanText(payload.api_key);
  const testOnly = payload.test_only === true;

  if (!tenantId || !UUID_RE.test(tenantId)) return json({ error: "Invalid tenant_id" }, 400);
  if (!apiKey) return json({ error: "api_key is required" }, 400);

  let account: UptimeRobotAccount;
  try {
    account = await testUptimeRobot(apiKey);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return json({ error: "Connection test failed", detail }, 422);
  }

  if (testOnly) {
    return json({ ok: true, status: "active", account_email: account.email ?? null });
  }

  let apiKeyEnc: string;
  try {
    apiKeyEnc = await encrypt(apiKey, secrets.intakeSecretsKey);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return json({ error: "Failed to encrypt API key", detail }, 500);
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("monitoring_connections").upsert(
    {
      tenant_id: tenantId,
      provider: PROVIDER,
      api_key_enc: apiKeyEnc,
      account_email: account.email ?? null,
      status: "active",
      last_checked_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    console.error("[save-monitoring-connection] upsert error", error);
    return json({ error: "Failed to save monitoring configuration" }, 500);
  }

  return json({ ok: true, status: "active", account_email: account.email ?? null });
});
