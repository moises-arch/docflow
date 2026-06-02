// Renews Microsoft Graph subscriptions for `email_ingest_sources` rows whose
// adapter is `microsoft_graph`. Graph mailbox subscriptions max out at ~70.5h,
// so this runs on a pg_cron every 6 hours and PATCHes any subscription
// expiring within the next 24h. If the existing subscription is already gone
// (expired or revoked), it recreates one in-place.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const RENEW_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const NEW_EXPIRY_MS = 60 * 60 * 60 * 1000; // 60h (under the 70.5h Graph cap)

type EmailSource = {
  id: string;
  tenant_id: string;
  address: string;
  settings: Record<string, unknown> | null;
};

function setting(source: EmailSource, key: string): string | null {
  const value = source.settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

async function getGraphToken(source: EmailSource): Promise<string> {
  const tenantId = setting(source, "graph_tenant_id") ?? Deno.env.get("MICROSOFT_GRAPH_TENANT_ID");
  const clientId = setting(source, "graph_client_id") ?? Deno.env.get("MICROSOFT_GRAPH_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_GRAPH_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("microsoft_graph_credentials_missing");
  }
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!response.ok) throw new Error(`graph_token_failed:${response.status}`);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("graph_token_missing");
  return payload.access_token;
}

function notificationUrl(source: EmailSource): string {
  const baseUrl =
    Deno.env.get("INTAKE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  const secret = setting(source, "webhook_secret");
  if (!baseUrl || !secret) throw new Error("webhook_url_missing");
  const url = new URL(`${baseUrl}/functions/v1/email-ingest`);
  url.searchParams.set("adapter", "microsoft_graph");
  url.searchParams.set("secret", secret);
  url.searchParams.set("source_id", source.id);
  return url.toString();
}

async function patchSubscription(
  accessToken: string,
  subscriptionId: string,
  expiresAt: string,
): Promise<{ ok: boolean; status: number; expirationDateTime?: string }> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expirationDateTime: expiresAt }),
    },
  );
  if (!response.ok) return { ok: false, status: response.status };
  const payload = (await response.json()) as { expirationDateTime?: string };
  return { ok: true, status: response.status, expirationDateTime: payload.expirationDateTime };
}

async function createSubscription(
  source: EmailSource,
  accessToken: string,
  expiresAt: string,
): Promise<{ id: string; expirationDateTime: string }> {
  const mailbox = setting(source, "graph_mailbox_id") ?? source.address;
  const folder = setting(source, "graph_folder_id") ?? "Inbox";
  const clientState = setting(source, "graph_client_state");
  if (!clientState) throw new Error("missing_client_state");

  const response = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changeType: "created",
      notificationUrl: notificationUrl(source),
      resource: `/users/${mailbox}/mailFolders/${folder}/messages`,
      expirationDateTime: expiresAt,
      clientState,
    }),
  });
  const payload = (await response.json()) as {
    id?: string;
    expirationDateTime?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.id) {
    throw new Error(`graph_subscription_create_failed:${payload.error?.message ?? response.status}`);
  }
  return {
    id: payload.id,
    expirationDateTime: payload.expirationDateTime ?? expiresAt,
  };
}

async function processSource(
  supabase: ReturnType<typeof createServiceClient>,
  source: EmailSource,
): Promise<{ source_id: string; action: string; expires_at?: string; error?: string }> {
  const subscriptionId = setting(source, "graph_subscription_id");
  const expiresAtIso = setting(source, "graph_subscription_expires_at");
  const expiresMs = expiresAtIso ? Date.parse(expiresAtIso) : 0;

  // Skip if subscription is healthy and not within renewal window
  if (subscriptionId && expiresMs - Date.now() > RENEW_WINDOW_MS) {
    return { source_id: source.id, action: "skipped", expires_at: expiresAtIso ?? undefined };
  }

  const newExpiry = new Date(Date.now() + NEW_EXPIRY_MS).toISOString();
  const accessToken = await getGraphToken(source);

  let action = "renewed";
  let confirmedExpiry = newExpiry;

  if (subscriptionId) {
    const patched = await patchSubscription(accessToken, subscriptionId, newExpiry);
    if (patched.ok) {
      confirmedExpiry = patched.expirationDateTime ?? newExpiry;
    } else {
      // Existing subscription is gone (404) or invalid (400) — recreate.
      const created = await createSubscription(source, accessToken, newExpiry);
      action = "recreated";
      confirmedExpiry = created.expirationDateTime;
      const { error } = await supabase
        .from("email_ingest_sources")
        .update({
          settings: {
            ...(source.settings ?? {}),
            graph_subscription_id: created.id,
            graph_subscription_expires_at: created.expirationDateTime,
          },
        })
        .eq("id", source.id);
      if (error) throw error;
      return { source_id: source.id, action, expires_at: confirmedExpiry };
    }
  } else {
    // No subscription yet — create one
    const created = await createSubscription(source, accessToken, newExpiry);
    action = "created";
    confirmedExpiry = created.expirationDateTime;
    const { error } = await supabase
      .from("email_ingest_sources")
      .update({
        settings: {
          ...(source.settings ?? {}),
          graph_subscription_id: created.id,
          graph_subscription_expires_at: created.expirationDateTime,
        },
      })
      .eq("id", source.id);
    if (error) throw error;
    return { source_id: source.id, action, expires_at: confirmedExpiry };
  }

  // Renewal succeeded — persist new expiry
  const { error } = await supabase
    .from("email_ingest_sources")
    .update({
      settings: {
        ...(source.settings ?? {}),
        graph_subscription_expires_at: confirmedExpiry,
      },
    })
    .eq("id", source.id);
  if (error) throw error;

  return { source_id: source.id, action, expires_at: confirmedExpiry };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createServiceClient();

  try {
    const { data, error } = await supabase
      .from("email_ingest_sources")
      .select("id, tenant_id, address, settings")
      .eq("status", "active")
      .eq("settings->>adapter", "microsoft_graph");
    if (error) throw error;

    const sources = (data ?? []) as EmailSource[];
    const summaries: Array<Record<string, unknown>> = [];

    for (const source of sources) {
      try {
        summaries.push(await processSource(supabase, source));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        summaries.push({ source_id: source.id, action: "failed", error: message });
      }
    }

    return json({ ok: true, sources: sources.length, summaries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: "graph_renew_failed", detail: message }, 500);
  }
});
