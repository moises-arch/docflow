import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { secrets } from "../_shared/secrets.ts";
import { encrypt } from "../_shared/crypto.ts";

interface SavePayload {
  tenant_id?: string;
  base_url?: string;
  database?: string;
  username?: string;
  password?: string; // plaintext — encrypted server-side, never stored raw
  export_mode?: string;
  contact_settings?: Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

// ─── Test connectivity before saving ─────────────────────────────────────────
async function testOdooAuth(
  baseUrl: string,
  database: string,
  username: string,
  password: string,
): Promise<{ uid: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: 1,
        params: {
          service: "common",
          method: "authenticate",
          args: [database, username, password, {}],
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`Odoo unreachable (HTTP ${res.status})`);

  const body = (await res.json()) as {
    result?: unknown;
    error?: { data?: { message?: string } };
  };

  if (body.error) {
    throw new Error(body.error.data?.message ?? "Odoo RPC error");
  }

  const uid = body.result;
  if (typeof uid !== "number" || uid === 0) {
    throw new Error("Authentication failed — check credentials");
  }

  return { uid };
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: SavePayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { tenant_id, base_url, database, username, password } = payload;
  const exportMode = payload.export_mode === "quotation" ? "quotation" : "sales_order";

  if (!tenant_id || !UUID_RE.test(tenant_id)) {
    return json({ error: "Invalid tenant_id" }, 400);
  }
  if (!base_url || !database || !username || !password) {
    return json({ error: "base_url, database, username, and password are required" }, 400);
  }

  // Normalise URL — strip trailing slash
  const normUrl = base_url.replace(/\/$/, "");

  // ── 1. Test connection ────────────────────────────────────────────────────
  let uid: number;
  try {
    ({ uid } = await testOdooAuth(normUrl, database, username, password));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: "Connection test failed", detail: msg }, 422);
  }

  // ── 2. Encrypt password ───────────────────────────────────────────────────
  const apiKeyEnc = await encrypt(password, secrets.intakeSecretsKey);

  // ── 3. Upsert connection record ───────────────────────────────────────────
  const DEFAULT_CONTACT_SETTINGS = {
    customer_match_field: "name",
    customer_match_scope: "under_reseller",
    customer_is_company: false,
    create_if_not_found: true,
    sync_billing_address: true,
    sync_shipping_address: true,
    address_update_strategy: "always",
    update_contact_info: true,
  };

  const supabase = createServiceClient();
  const { error } = await supabase.from("odoo_connections").upsert(
    {
      tenant_id,
      base_url: normUrl,
      database,
      username,
      api_key_enc: apiKeyEnc,
      export_mode: exportMode,
      contact_settings: payload.contact_settings ?? DEFAULT_CONTACT_SETTINGS,
      status: "active",
      last_checked_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    console.error("[save-odoo-connection] upsert error:", error);
    return json({ error: "Failed to save connection" }, 500);
  }

  return json({ ok: true, uid });
});
