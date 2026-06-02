// Healthcheck profundo de Microsoft 365 / Graph integration.
// Corre cada 6h (cron) o on-demand (POST con session auth).
//
// Para cada fuente activa M365 valida:
//   - Token: se obtiene OK
//   - Subscription: GET /subscriptions/{id} responde 200 (no fue invalidada
//     por Microsoft por cambio de password / permisos)
//   - Inbox listing: LIST con $top=1 funciona
//   - Messages 24h: cuántos emails se ingestaron en las últimas 24h
//
// Si Microsoft reporta 404 para la suscripción → crea una nueva.
// Si reporta expiry distinta a la nuestra → actualiza DB.
// Si algo falla → admin alert + log a m365_health_checks.

import { sendAdminAlert } from "@/lib/email/admin-alert";
import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { createNotification } from "@/lib/notifications/create";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
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
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access_token");
  return data.access_token;
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
  lt: (column: string, value: unknown) => AnyQuery;
  gte: (column: string, value: unknown) => AnyQuery;
  like: (column: string, pattern: string) => AnyQuery;
  order: (column: string, opts?: { ascending?: boolean }) => AnyQuery;
  limit: (n: number) => AnyQuery;
  single: () => AnyQuery;
  maybeSingle: () => AnyQuery;
};
type SvcClient = { from: (table: string) => AnyQuery };

function asDyn(svc: ReturnType<typeof createServiceClient>): SvcClient {
  return svc as unknown as SvcClient;
}

type ChecksReport = {
  token: boolean;
  subscription_id?: string | null;
  subscription_exists: boolean;
  subscription_expires_at_graph?: string | null;
  subscription_expires_at_db?: string | null;
  subscription_synced?: boolean;
  inbox_listing: boolean;
  messages_24h: number;
  recreated_subscription?: boolean;
  notes?: string[];
};

async function checkSource(
  svc: SvcClient,
  source: M365Source,
  token: string,
): Promise<{ ok: boolean; checks: ChecksReport; error?: string }> {
  const settings = source.settings ?? {};
  const subscriptionId = settings.graph_subscription_id as string | undefined;
  const dbExpiresAt = (settings.graph_subscription_expires_at as string | undefined) ?? null;
  const mailbox = (settings.graph_mailbox_id as string | undefined) ?? source.address;
  const folder = (settings.graph_folder_id as string | undefined) ?? "Inbox";

  const checks: ChecksReport = {
    token: true,
    subscription_id: subscriptionId ?? null,
    subscription_exists: false,
    subscription_expires_at_db: dbExpiresAt,
    inbox_listing: false,
    messages_24h: 0,
    notes: [],
  };

  let ok = true;
  const errors: string[] = [];

  // 1) Validar suscripción contra Microsoft.
  if (subscriptionId) {
    const subRes = await fetch(
      `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (subRes.ok) {
      const body = (await subRes.json()) as { expirationDateTime?: string };
      checks.subscription_exists = true;
      checks.subscription_expires_at_graph = body.expirationDateTime ?? null;
      checks.subscription_synced = body.expirationDateTime === dbExpiresAt;
      if (!checks.subscription_synced && body.expirationDateTime) {
        // Sincronizar.
        await svc
          .from("email_ingest_sources")
          .update({
            settings: {
              ...settings,
              graph_subscription_expires_at: body.expirationDateTime,
            },
          })
          .eq("id", source.id);
        checks.notes?.push("synced expiry from Microsoft");
      }
    } else if (subRes.status === 404) {
      checks.subscription_exists = false;
      checks.notes?.push("subscription 404 — recreating");
      // Recrear.
      const webhookSecret = settings.webhook_secret as string | undefined;
      const clientState = settings.graph_client_state as string | undefined;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (webhookSecret && clientState && supabaseUrl) {
        const newExpiry = new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString();
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
          await svc
            .from("email_ingest_sources")
            .update({
              settings: {
                ...settings,
                graph_subscription_id: created.id,
                graph_subscription_expires_at: created.expirationDateTime ?? newExpiry,
              },
            })
            .eq("id", source.id);
          checks.subscription_exists = true;
          checks.subscription_id = created.id ?? null;
          checks.recreated_subscription = true;
          checks.subscription_expires_at_graph = created.expirationDateTime ?? newExpiry;
        } else {
          ok = false;
          const errBody = await createRes.text().catch(() => "");
          errors.push(`recreate failed: HTTP ${createRes.status} ${errBody.slice(0, 100)}`);
        }
      } else {
        ok = false;
        errors.push("subscription missing in Microsoft, cannot recreate (config incomplete)");
      }
    } else {
      ok = false;
      const errBody = await subRes.text().catch(() => "");
      errors.push(`subscription check failed: HTTP ${subRes.status} ${errBody.slice(0, 100)}`);
    }
  } else {
    ok = false;
    errors.push("no subscription_id stored");
  }

  // 2) Inbox listing.
  const listUrl = new URL(
    `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/${folder}/messages`,
  );
  listUrl.searchParams.set("$select", "id");
  listUrl.searchParams.set("$top", "1");
  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (listRes.ok) {
    checks.inbox_listing = true;
  } else {
    ok = false;
    errors.push(`inbox listing failed: HTTP ${listRes.status}`);
  }

  // 3) Messages 24h count.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await svc
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", source.tenant_id)
    .eq("ingest_source_id", source.id)
    .gte("received_at", since);
  checks.messages_24h = count ?? 0;

  return {
    ok,
    checks,
    error: errors.length ? errors.join("; ") : undefined,
  };
}

async function handle(req: NextRequest, requireCron: boolean) {
  if (requireCron) {
    if (!isCronRequest(req)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (!isCronRequest(req)) {
    const ctx = await getTenantContext();
    if ("error" in ctx) return ctx.error;
  }

  const svc = asDyn(createServiceClient());

  const { data: sources } = await svc
    .from("email_ingest_sources")
    .select("id, tenant_id, address, settings")
    .eq("status", "active");

  const m365Sources = ((sources ?? []) as M365Source[]).filter(
    (s) => s.settings?.adapter === "microsoft_graph",
  );

  if (m365Sources.length === 0) {
    return NextResponse.json({ ok: true, results: [], message: "No M365 sources" });
  }

  let token: string;
  try {
    token = await getGraphToken();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Log token-level failure on each source.
    for (const s of m365Sources) {
      await svc.from("m365_health_checks").insert({
        tenant_id: s.tenant_id,
        source_id: s.id,
        ok: false,
        checks: { token: false } as Record<string, unknown>,
        error,
      });
    }
    await sendAdminAlert(
      "M365 healthcheck: Graph token failed",
      `Cannot obtain access token. Error: ${error}\nM365 ingestion is fully broken until this is fixed.`,
    );
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  const results: Array<{
    address: string;
    ok: boolean;
    checks: ChecksReport;
    error?: string;
  }> = [];

  for (const source of m365Sources) {
    let outcome: { ok: boolean; checks: ChecksReport; error?: string };
    try {
      outcome = await checkSource(svc, source, token);
    } catch (err) {
      outcome = {
        ok: false,
        checks: { token: true, subscription_exists: false, inbox_listing: false, messages_24h: 0 },
        error: err instanceof Error ? err.message : String(err),
      };
    }

    await svc.from("m365_health_checks").insert({
      tenant_id: source.tenant_id,
      source_id: source.id,
      ok: outcome.ok,
      checks: outcome.checks as unknown as Record<string, unknown>,
      error: outcome.error ?? null,
    });

    if (!outcome.ok) {
      await sendAdminAlert(
        `M365 healthcheck failed for ${source.address}`,
        `Tenant ${source.tenant_id}\nError: ${outcome.error ?? "unknown"}\nChecks: ${JSON.stringify(outcome.checks, null, 2)}`,
      );
      const description = outcome.error
        ? outcome.error.slice(0, 200)
        : "Un paso del healthcheck falló";
      await createNotification({
        tenantId: source.tenant_id,
        source: "healthcheck",
        severity: "error",
        title: "Microsoft 365 healthcheck falló",
        description,
        href: null,
      });
    } else {
      // Silencio sospechoso: 0 mensajes en 48h.
      const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { count: c48 } = await svc
        .from("inbound_emails")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", source.tenant_id)
        .eq("ingest_source_id", source.id)
        .gte("received_at", since48h);
      if ((c48 ?? 0) === 0) {
        await sendAdminAlert(
          `M365 silence: 0 emails in 48h for ${source.address}`,
          `Tenant ${source.tenant_id} — no emails received in the last 48h. Verify the mailbox isn't disconnected upstream.`,
        );
      }
    }

    results.push({
      address: source.address,
      ok: outcome.ok,
      checks: outcome.checks,
      error: outcome.error,
    });
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results });
}

export async function GET(req: NextRequest) {
  return handle(req, true);
}

export async function POST(req: NextRequest) {
  return handle(req, false);
}
