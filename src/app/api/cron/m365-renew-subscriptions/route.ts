// Renovar suscripciones de Microsoft Graph antes de que expiren.
// Corre cada 6h. Microsoft Graph caps suscripciones a ~72h.
//
// Hardening:
// - Margen de renovación: 36h (no 24h). Si el cron falla varias veces,
//   todavía nos quedan ~36h antes de perder emails.
// - Si PATCH falla → fallback inmediato a CREATE en este mismo run.
// - Cada intento se registra en m365_renewal_log.
// - Si una misma fuente acumula 3 fallos consecutivos → admin alert.

import { sendAdminAlert } from "@/lib/email/admin-alert";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const RENEW_THRESHOLD_MS = 36 * 60 * 60 * 1000; // renovar si expira en menos de 36h
const NEW_EXPIRY_MS = 60 * 60 * 60 * 1000;       // 60h de extensión
const CONSECUTIVE_FAIL_THRESHOLD = 3;

type RenewalAction = "renewed" | "recreated" | "failed" | "skipped";

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID;
  const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) throw new Error("Graph credentials missing");

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) throw new Error(`Graph token failed: ${res.status}`);
  const payload = (await res.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("No access_token in response");
  return payload.access_token;
}

type M365Source = {
  id: string;
  tenant_id: string;
  address: string;
  settings: Record<string, unknown> | null;
};

// Cliente untyped para tablas m365_* fuera de los tipos generados.
type AnyQuery = Promise<{ data: unknown; error: unknown; count?: number | null }> & {
  select: (cols?: string, opts?: { count?: "exact"; head?: boolean }) => AnyQuery;
  insert: (values: unknown) => AnyQuery;
  update: (values: unknown) => AnyQuery;
  delete: () => AnyQuery;
  eq: (column: string, value: unknown) => AnyQuery;
  is: (column: string, value: unknown) => AnyQuery;
  order: (column: string, opts?: { ascending?: boolean }) => AnyQuery;
  limit: (n: number) => AnyQuery;
  single: () => AnyQuery;
  maybeSingle: () => AnyQuery;
};
type SvcClient = { from: (table: string) => AnyQuery };

function asDyn(svc: ReturnType<typeof createServiceClient>): SvcClient {
  return svc as unknown as SvcClient;
}

type LogRow = {
  tenant_id: string;
  source_id: string;
  action: RenewalAction;
  subscription_id?: string | null;
  old_expires_at?: string | null;
  new_expires_at?: string | null;
  error?: string | null;
};

async function logRenewal(svc: SvcClient, row: LogRow) {
  try {
    await svc.from("m365_renewal_log").insert(row);
  } catch (err) {
    console.error("m365_renewal_log insert failed", err);
  }
}

async function countRecentFailures(svc: SvcClient, sourceId: string): Promise<number> {
  // Cuenta intentos consecutivos donde action='failed' al tope de la lista.
  const { data } = await svc
    .from("m365_renewal_log")
    .select("action")
    .eq("source_id", sourceId)
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as Array<{ action: string }>;
  let count = 0;
  for (const r of rows) {
    if (r.action === "failed") count++;
    else break;
  }
  return count;
}

async function attemptRenew(
  source: M365Source,
  token: string,
): Promise<{ action: RenewalAction; expiresAt: string | null; subscriptionId: string | null; error?: string }> {
  const settings = source.settings ?? {};
  const subscriptionId = settings.graph_subscription_id as string | undefined;
  if (!subscriptionId) {
    return { action: "failed", expiresAt: null, subscriptionId: null, error: "missing subscription_id" };
  }

  const newExpiry = new Date(Date.now() + NEW_EXPIRY_MS).toISOString();

  // 1) Intentar PATCH primero.
  const patchRes = await fetch(
    `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expirationDateTime: newExpiry }),
    },
  );

  if (patchRes.ok) {
    const updated = (await patchRes.json()) as { expirationDateTime?: string };
    return {
      action: "renewed",
      expiresAt: updated.expirationDateTime ?? newExpiry,
      subscriptionId,
    };
  }

  // 2) PATCH falló → intentar CREATE inmediatamente.
  const patchErrBody = (await patchRes.json().catch(() => ({}))) as { error?: { message?: string } };
  const patchErrMsg = patchErrBody.error?.message ?? `HTTP ${patchRes.status}`;

  const mailbox = (settings.graph_mailbox_id as string | undefined) ?? source.address;
  const folder = (settings.graph_folder_id as string | undefined) ?? "Inbox";
  const clientState = settings.graph_client_state as string | undefined;
  const webhookSecret = settings.webhook_secret as string | undefined;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!clientState || !webhookSecret || !supabaseUrl) {
    return {
      action: "failed",
      expiresAt: null,
      subscriptionId,
      error: `patch failed (${patchErrMsg}); recreate skipped (missing config)`,
    };
  }

  const notifUrl = `${supabaseUrl}/functions/v1/email-ingest?adapter=microsoft_graph&secret=${webhookSecret}&source_id=${source.id}`;
  const createRes = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      changeType: "created",
      notificationUrl: notifUrl,
      resource: `/users/${mailbox}/mailFolders/${folder}/messages`,
      expirationDateTime: newExpiry,
      clientState,
    }),
  });

  if (createRes.ok) {
    const created = (await createRes.json()) as { id?: string; expirationDateTime?: string };
    return {
      action: "recreated",
      expiresAt: created.expirationDateTime ?? newExpiry,
      subscriptionId: created.id ?? null,
    };
  }

  const createErrBody = (await createRes.json().catch(() => ({}))) as { error?: { message?: string } };
  const createErrMsg = createErrBody.error?.message ?? `HTTP ${createRes.status}`;
  return {
    action: "failed",
    expiresAt: null,
    subscriptionId,
    error: `patch failed (${patchErrMsg}); recreate failed (${createErrMsg})`,
  };
}

async function handle(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const svc = asDyn(createServiceClient());

  const { data: sources } = await svc
    .from("email_ingest_sources")
    .select("id, tenant_id, address, settings")
    .eq("status", "active");

  const m365Sources = ((sources ?? []) as M365Source[]).filter(
    (s) => s.settings?.adapter === "microsoft_graph" && s.settings?.graph_subscription_id,
  );

  if (m365Sources.length === 0) {
    return NextResponse.json({ ok: true, renewed: 0, message: "No M365 sources found" });
  }

  let token: string | null = null;
  const results: Array<{ address: string; action: RenewalAction; ok: boolean; error?: string }> = [];

  for (const source of m365Sources) {
    const settings = source.settings ?? {};
    const expiresAt = settings.graph_subscription_expires_at as string | undefined;
    const subscriptionId = settings.graph_subscription_id as string | undefined;
    if (!subscriptionId) continue;

    const expiresMs = expiresAt ? new Date(expiresAt).getTime() : 0;
    const msUntilExpiry = expiresMs - Date.now();

    if (msUntilExpiry > RENEW_THRESHOLD_MS) {
      await logRenewal(svc, {
        tenant_id: source.tenant_id,
        source_id: source.id,
        action: "skipped",
        subscription_id: subscriptionId,
        old_expires_at: expiresAt ?? null,
      });
      results.push({ address: source.address, action: "skipped", ok: true });
      continue;
    }

    try {
      if (!token) token = await getGraphToken();
      const outcome = await attemptRenew(source, token);

      await logRenewal(svc, {
        tenant_id: source.tenant_id,
        source_id: source.id,
        action: outcome.action,
        subscription_id: outcome.subscriptionId,
        old_expires_at: expiresAt ?? null,
        new_expires_at: outcome.expiresAt,
        error: outcome.error ?? null,
      });

      if (outcome.action === "renewed" || outcome.action === "recreated") {
        const nextSettings: Record<string, unknown> = {
          ...settings,
          graph_subscription_expires_at: outcome.expiresAt,
        };
        if (outcome.action === "recreated" && outcome.subscriptionId) {
          nextSettings.graph_subscription_id = outcome.subscriptionId;
        }
        // Limpiar último error en settings al renovar exitosamente.
        delete nextSettings.last_error;
        await svc
          .from("email_ingest_sources")
          .update({ settings: nextSettings })
          .eq("id", source.id);
        results.push({ address: source.address, action: outcome.action, ok: true });
      } else {
        await svc
          .from("email_ingest_sources")
          .update({
            settings: {
              ...settings,
              last_error: outcome.error ?? "renewal failed",
              last_error_at: new Date().toISOString(),
            },
          })
          .eq("id", source.id);

        results.push({
          address: source.address,
          action: "failed",
          ok: false,
          error: outcome.error,
        });

        const fails = await countRecentFailures(svc, source.id);
        if (fails >= CONSECUTIVE_FAIL_THRESHOLD) {
          await sendAdminAlert(
            `M365 renewal failing for ${source.address}`,
            `Source ${source.id} (tenant ${source.tenant_id}) has failed renewal ${fails} times in a row.\nLast error: ${outcome.error}\nSubscription expires at: ${expiresAt ?? "unknown"}.\nAct soon — past ~72h the subscription is gone and emails will be missed.`,
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logRenewal(svc, {
        tenant_id: source.tenant_id,
        source_id: source.id,
        action: "failed",
        subscription_id: subscriptionId,
        old_expires_at: expiresAt ?? null,
        error: message,
      });
      results.push({ address: source.address, action: "failed", ok: false, error: message });
    }
  }

  const renewed = results.filter((r) => r.action === "renewed" || r.action === "recreated").length;
  return NextResponse.json({ ok: true, renewed, results });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
