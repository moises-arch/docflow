// Admin operations for IMAP email sources, invoked by the Next.js API layer:
//   - action=test : verify credentials by opening a connection (no fetch)
//   - action=save : encrypt password with INTAKE_SECRETS_KEY and upsert the
//                   email_ingest_sources row
// Both calls require the service-role bearer; the caller (server-side route
// handler) must have already verified the user's tenant access.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { ImapFlow } from "npm:imapflow@1.0.171";
import { createServiceClient } from "../_shared/supabase.ts";
import { decrypt, encrypt } from "../_shared/crypto.ts";
import { secrets } from "../_shared/secrets.ts";

type Action = "test" | "save";

interface BasePayload {
  tenant_id?: string;
  imap_host?: string;
  imap_port?: number;
  imap_secure?: boolean;
  imap_username?: string;
  imap_password?: string;
  imap_mailbox?: string;
}

interface SavePayload extends BasePayload {
  source_id?: string | null;
  address?: string;
  provider_id?: string | null;
  allowed_senders?: string[];
  imap_mark_seen?: boolean;
  allowed_mime_types?: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

async function testConnection(payload: BasePayload): Promise<{ ok: boolean; detail?: string }> {
  if (!payload.imap_host || !payload.imap_username || !payload.imap_password) {
    return { ok: false, detail: "Missing host, username or password" };
  }
  const client = new ImapFlow({
    host: payload.imap_host,
    port: payload.imap_port ?? 993,
    secure: payload.imap_secure !== false,
    auth: { user: payload.imap_username, pass: payload.imap_password },
    logger: false,
    emitLogs: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock(payload.imap_mailbox || "INBOX");
    lock.release();
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

async function saveSource(payload: SavePayload): Promise<Response> {
  if (!payload.tenant_id || !UUID_RE.test(payload.tenant_id)) {
    return json({ error: "Invalid tenant_id" }, 400);
  }
  if (!payload.address || !payload.address.includes("@")) {
    return json({ error: "Invalid address" }, 422);
  }
  if (!payload.imap_host || !payload.imap_username || !payload.imap_password) {
    return json({ error: "Missing IMAP credentials" }, 422);
  }

  const test = await testConnection(payload);
  if (!test.ok) {
    return json({ error: "Connection test failed", detail: test.detail }, 422);
  }

  const passwordEnc = await encrypt(payload.imap_password, secrets.intakeSecretsKey);
  const supabase = createServiceClient();

  const settings: Record<string, unknown> = {
    adapter: "imap",
    imap_host: payload.imap_host,
    imap_port: payload.imap_port ?? 993,
    imap_secure: payload.imap_secure !== false,
    imap_username: payload.imap_username,
    imap_password_enc: passwordEnc,
    imap_mailbox: payload.imap_mailbox || "INBOX",
    imap_mark_seen: payload.imap_mark_seen !== false,
    allowed_mime_types:
      Array.isArray(payload.allowed_mime_types) && payload.allowed_mime_types.length > 0
        ? payload.allowed_mime_types
        : ["application/pdf"],
  };

  const address = payload.address.trim().toLowerCase();
  const allowedSenders = (payload.allowed_senders ?? []).map((s) => s.trim().toLowerCase()).filter(
    Boolean,
  );

  if (payload.source_id && UUID_RE.test(payload.source_id)) {
    // Preserve previous watermark fields when updating
    const { data: prev } = await supabase
      .from("email_ingest_sources")
      .select("settings")
      .eq("id", payload.source_id)
      .eq("tenant_id", payload.tenant_id)
      .maybeSingle();
    const prevSettings = ((prev?.settings as Record<string, unknown>) ?? {});
    const merged = {
      ...prevSettings,
      ...settings,
      // keep watermark to avoid re-ingesting on credential rotation
      imap_last_uid: prevSettings.imap_last_uid ?? 0,
      imap_last_synced_at: prevSettings.imap_last_synced_at ?? null,
    };
    const { data, error } = await supabase
      .from("email_ingest_sources")
      .update({
        provider_id: payload.provider_id ?? null,
        address,
        allowed_senders: allowedSenders,
        settings: merged,
      })
      .eq("id", payload.source_id)
      .eq("tenant_id", payload.tenant_id)
      .select("id, tenant_id, provider_id, address, status, allowed_senders")
      .single();
    if (error) return json({ error: error.message ?? "Update failed" }, 500);
    return json({ ok: true, source: data });
  }

  const { data, error } = await supabase
    .from("email_ingest_sources")
    .insert({
      tenant_id: payload.tenant_id,
      provider_id: payload.provider_id ?? null,
      address,
      allowed_senders: allowedSenders,
      settings,
      status: "active",
    })
    .select("id, tenant_id, provider_id, address, status, allowed_senders")
    .single();
  if (error) return json({ error: error.message ?? "Create failed" }, 500);
  return json({ ok: true, source: data }, 201);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: SavePayload & { action?: Action };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = payload.action ?? "save";
  if (action === "test") {
    // Allow testing already-stored credentials without round-tripping the
    // plaintext password back to the client.
    const useSaved = (payload as { use_saved?: boolean }).use_saved === true;
    const sourceId = (payload as { source_id?: string }).source_id;
    if (useSaved && sourceId && UUID_RE.test(sourceId) && payload.tenant_id) {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("email_ingest_sources")
        .select("settings")
        .eq("id", sourceId)
        .eq("tenant_id", payload.tenant_id)
        .maybeSingle();
      const settings = (data?.settings as Record<string, unknown> | null) ?? null;
      if (!settings || settings.adapter !== "imap") {
        return json({ ok: false, detail: "IMAP source not found" }, 404);
      }
      const result = await testConnection({
        imap_host: settings.imap_host as string,
        imap_port: settings.imap_port as number,
        imap_secure: settings.imap_secure as boolean,
        imap_username: settings.imap_username as string,
        imap_password: await decrypt(
          settings.imap_password_enc as string,
          secrets.intakeSecretsKey,
        ),
        imap_mailbox: settings.imap_mailbox as string,
      });
      return json(result, result.ok ? 200 : 422);
    }
    const result = await testConnection(payload);
    return json(result, result.ok ? 200 : 422);
  }
  if (action === "save") return saveSource(payload);
  return json({ error: "Unknown action" }, 400);
});
