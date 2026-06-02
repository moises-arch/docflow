export const maxDuration = 60;
import {
  cleanText,
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { NextRequest, NextResponse } from "next/server";

type EmailSource = {
  id: string;
  tenant_id: string;
  address: string;
  settings: Record<string, unknown> | null;
};

function setting(source: EmailSource, key: string) {
  const value = source.settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function getGraphToken(source: EmailSource) {
  const tenantId = setting(source, "graph_tenant_id") ?? process.env.MICROSOFT_GRAPH_TENANT_ID;
  const clientId = setting(source, "graph_client_id") ?? process.env.MICROSOFT_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph credentials are missing.");
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
  if (!response.ok) throw new Error(`Microsoft Graph token failed: ${response.status}`);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("Microsoft Graph token missing.");
  return payload.access_token;
}

function notificationUrl(source: EmailSource) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = setting(source, "webhook_secret");
  if (!baseUrl || !secret) throw new Error("Email ingest webhook is not configured.");
  const url = new URL(`${baseUrl}/functions/v1/email-ingest`);
  url.searchParams.set("adapter", "microsoft_graph");
  url.searchParams.set("secret", secret);
  url.searchParams.set("source_id", source.id);
  return url.toString();
}

export async function POST(req: NextRequest) {
  const context = await getTenantContext();
  if ("error" in context) return context.error;
  const { supabase, tenantId } = context;
  const db = supabase as unknown as DynamicSupabaseClient;

  let body: { source_id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourceId = cleanText(body.source_id);
  if (!sourceId) return NextResponse.json({ error: "Missing source_id" }, { status: 422 });

  const { data: source, error: sourceError } = await db
    .from<EmailSource[]>("email_ingest_sources")
    .select("id, tenant_id, address, settings")
    .eq("id", sourceId)
    .eq("tenant_id", tenantId)
    .single();
  const normalizedSource = Array.isArray(source) ? source[0] : (source as EmailSource | null);
  if (sourceError || !normalizedSource) {
    return NextResponse.json(
      { error: sourceError?.message ?? "Email source not found" },
      { status: 404 },
    );
  }
  if (setting(normalizedSource, "adapter") !== "microsoft_graph") {
    return NextResponse.json({ error: "Source is not Microsoft Graph" }, { status: 422 });
  }

  try {
    const accessToken = await getGraphToken(normalizedSource);
    const mailbox = setting(normalizedSource, "graph_mailbox_id") ?? normalizedSource.address;
    const folder = setting(normalizedSource, "graph_folder_id") ?? "Inbox";
    const clientState = setting(normalizedSource, "graph_client_state");
    if (!clientState) return NextResponse.json({ error: "Missing clientState" }, { status: 422 });

    // Graph mail subscriptions cap at ~70.5h. Use 60h so the renewal cron
    // (every 6h, renewing within 24h of expiry) always has headroom.
    const expiresAt = new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString();
    const graphResponse = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: notificationUrl(normalizedSource),
        resource: `/users/${mailbox}/mailFolders/${folder}/messages`,
        expirationDateTime: expiresAt,
        clientState,
      }),
    });
    const graphPayload = (await graphResponse.json()) as {
      id?: string;
      expirationDateTime?: string;
      error?: { message?: string };
    };
    if (!graphResponse.ok || !graphPayload.id) {
      return NextResponse.json(
        { error: graphPayload.error?.message ?? "Microsoft Graph subscription failed" },
        { status: 502 },
      );
    }

    const settings = {
      ...(normalizedSource.settings ?? {}),
      graph_subscription_id: graphPayload.id,
      graph_subscription_expires_at: graphPayload.expirationDateTime ?? expiresAt,
    };
    const { data: updated, error: updateError } = await db
      .from("email_ingest_sources")
      .update({ settings })
      .eq("id", normalizedSource.id)
      .eq("tenant_id", tenantId)
      .select("id, settings")
      .single();
    if (updateError) {
      return NextResponse.json(
        { error: updateError.message ?? "Subscription saved failed" },
        { status: 500 },
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Microsoft Graph subscription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
