// Escanea el inbox de Microsoft 365 vía Graph API buscando emails recientes
// que no hayan sido procesados aún. Cubre el caso donde la suscripción Graph
// no entregó la notificación (expiró, error de red, edge function caída).
//
// Hardening:
// - Dedup primaria por meta->>event_id LIKE %:graphMsgId:% (más confiable
//   que internetMessageId que puede ser null).
// - Locks (m365_processing_locks) con TTL 5min evitan doble-procesamiento
//   cuando el cron y el botón manual corren a la vez.
// - Si ingest falla → upsert a m365_failed_messages, incrementa attempts.
// - Antes del scan principal, reintenta mensajes pendientes (attempts < 5).
// - Si attempts >= 5 → admin alert, ya no reintenta.

import { sendAdminAlert } from "@/lib/email/admin-alert";
import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Tiempo máximo de scan (ms) antes de cortar el loop para no exceder maxDuration.
const SCAN_WALL_MS = 240_000; // 4 min → deja margen para responder

const SCAN_DAYS = 3;
const LOCK_TTL_MS = 5 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 5;

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

type GraphMessage = {
  id: string;
  internetMessageId: string | null;
  subject: string | null;
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  hasAttachments: boolean;
};

type M365Source = {
  id: string;
  tenant_id: string;
  address: string;
  settings: Record<string, unknown> | null;
};

// Cliente untyped para tablas m365_* que no están en los tipos generados.
// (El service-role bypassea RLS de todos modos.)
type AnyQuery = Promise<{ data: unknown; error: unknown; count?: number | null }> & {
  select: (cols?: string, opts?: { count?: "exact"; head?: boolean }) => AnyQuery;
  insert: (values: unknown) => AnyQuery;
  update: (values: unknown) => AnyQuery;
  upsert: (values: unknown, opts?: { onConflict?: string }) => AnyQuery;
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

async function cleanupExpiredLocks(svc: SvcClient) {
  try {
    await svc.from("m365_processing_locks").delete().lt("locked_until", new Date().toISOString());
  } catch (err) {
    console.error("locks cleanup failed", err);
  }
}

async function acquireLock(
  svc: SvcClient,
  tenantId: string,
  graphMessageId: string,
): Promise<boolean> {
  const lockedUntil = new Date(Date.now() + LOCK_TTL_MS).toISOString();
  // Intentar insert. Si ya existe y no expiró → no podemos procesar.
  const { error } = await svc.from("m365_processing_locks").insert({
    tenant_id: tenantId,
    graph_message_id: graphMessageId,
    locked_until: lockedUntil,
  });
  if (!error) return true;

  // Posible PK conflict — verificar si el lock está expirado y robarlo.
  const { data } = await svc
    .from("m365_processing_locks")
    .select("locked_until")
    .eq("tenant_id", tenantId)
    .eq("graph_message_id", graphMessageId)
    .maybeSingle();
  const row = data as { locked_until?: string } | null;
  if (row?.locked_until && new Date(row.locked_until).getTime() < Date.now()) {
    const { error: updErr } = await svc
      .from("m365_processing_locks")
      .update({ locked_until: lockedUntil })
      .eq("tenant_id", tenantId)
      .eq("graph_message_id", graphMessageId);
    return !updErr;
  }
  return false;
}

async function releaseLock(svc: SvcClient, tenantId: string, graphMessageId: string) {
  try {
    await svc.from("m365_processing_locks").delete()
      .eq("tenant_id", tenantId)
      .eq("graph_message_id", graphMessageId);
  } catch {
    // mejor esfuerzo
  }
}

async function recordFailure(
  svc: SvcClient,
  tenantId: string,
  sourceId: string,
  graphMessageId: string,
  internetMessageId: string | null,
  error: string,
) {
  const { data: existing } = await svc
    .from("m365_failed_messages")
    .select("id, attempts")
    .eq("tenant_id", tenantId)
    .eq("graph_message_id", graphMessageId)
    .maybeSingle();
  const row = existing as { id: string; attempts: number } | null;

  if (row) {
    const newAttempts = row.attempts + 1;
    await svc.from("m365_failed_messages").update({
      attempts: newAttempts,
      last_error: error.slice(0, 500),
      last_attempt_at: new Date().toISOString(),
    }).eq("id", row.id);

    if (newAttempts >= MAX_RETRY_ATTEMPTS) {
      await sendAdminAlert(
        `M365 message giving up after ${newAttempts} attempts`,
        `Tenant ${tenantId} source ${sourceId} graph_message_id ${graphMessageId}\nLast error: ${error}\nManual intervention required.`,
      );
    }
  } else {
    await svc.from("m365_failed_messages").insert({
      tenant_id: tenantId,
      source_id: sourceId,
      graph_message_id: graphMessageId,
      internet_message_id: internetMessageId,
      attempts: 1,
      last_error: error.slice(0, 500),
    });
  }
}

async function markResolved(svc: SvcClient, tenantId: string, graphMessageId: string) {
  try {
    await svc.from("m365_failed_messages").update({
      resolved_at: new Date().toISOString(),
    })
      .eq("tenant_id", tenantId)
      .eq("graph_message_id", graphMessageId);
  } catch {
    // ignore
  }
}

async function alreadyProcessed(
  svc: SvcClient,
  tenantId: string,
  graphMessageId: string,
  internetMessageId: string | null,
): Promise<boolean> {
  // Dedup primaria: meta->>event_id LIKE %:graphMessageId:%
  {
    const { count } = await svc
      .from("inbound_emails")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .like("meta->>event_id", `%:${graphMessageId}:%`);
    if ((count ?? 0) > 0) return true;
  }
  // Fallback: por internetMessageId si está disponible.
  if (internetMessageId) {
    const { count } = await svc
      .from("inbound_emails")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("message_id", internetMessageId);
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

async function callIngest(
  source: M365Source,
  mailbox: string,
  graphMessageId: string,
  supabaseUrl: string,
  webhookSecret: string,
  authKey: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const notifPayload = {
    value: [{
      subscriptionId: source.settings?.graph_subscription_id ?? "scan",
      changeType: "created",
      resource: `Users/${mailbox}/Messages/${graphMessageId}`,
      resourceData: { id: graphMessageId, "@odata.type": "#Microsoft.Graph.Message" },
      clientState: source.settings?.graph_client_state ?? "",
    }],
  };

  const ingestUrl = `${supabaseUrl}/functions/v1/email-ingest?adapter=microsoft_graph&secret=${webhookSecret}&source_id=${source.id}`;
  try {
    const ingestRes = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authKey}`,
      },
      body: JSON.stringify(notifPayload),
      signal: AbortSignal.timeout(45_000), // 45s por mensaje
    });
    if (ingestRes.ok) return { ok: true, status: ingestRes.status };
    const body = await ingestRes.text().catch(() => "");
    return { ok: false, status: ingestRes.status, error: `HTTP ${ingestRes.status}: ${body.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function retryFailedMessages(
  svc: SvcClient,
  sources: M365Source[],
  supabaseUrl: string,
  authKey: string,
): Promise<{ retried: number; resolved: number; errors: string[] }> {
  const errors: string[] = [];
  let retried = 0;
  let resolved = 0;

  const { data: pending } = await svc
    .from("m365_failed_messages")
    .select("id, tenant_id, source_id, graph_message_id, internet_message_id, attempts")
    .is("resolved_at", null)
    .lt("attempts", MAX_RETRY_ATTEMPTS)
    .limit(50);

  const rows = (pending ?? []) as Array<{
    tenant_id: string;
    source_id: string;
    graph_message_id: string;
    internet_message_id: string | null;
    attempts: number;
  }>;

  for (const row of rows) {
    const source = sources.find((s) => s.id === row.source_id);
    if (!source) continue;
    const webhookSecret = source.settings?.webhook_secret as string | undefined;
    const mailbox = (source.settings?.graph_mailbox_id as string | undefined) ?? source.address;
    if (!webhookSecret) continue;

    if (await alreadyProcessed(svc, row.tenant_id, row.graph_message_id, row.internet_message_id)) {
      await markResolved(svc, row.tenant_id, row.graph_message_id);
      resolved++;
      continue;
    }

    const locked = await acquireLock(svc, row.tenant_id, row.graph_message_id);
    if (!locked) continue;
    try {
      const ingest = await callIngest(source, mailbox, row.graph_message_id, supabaseUrl, webhookSecret, authKey);
      retried++;
      if (ingest.ok) {
        await markResolved(svc, row.tenant_id, row.graph_message_id);
        resolved++;
      } else {
        await recordFailure(svc, row.tenant_id, row.source_id, row.graph_message_id, row.internet_message_id, ingest.error ?? "unknown");
        errors.push(`retry ${row.graph_message_id.slice(-10)}: ${ingest.error}`);
      }
    } finally {
      await releaseLock(svc, row.tenant_id, row.graph_message_id);
    }
  }

  return { retried, resolved, errors };
}

async function runScan(
  svc: SvcClient,
  authKey: string,
): Promise<{
  ok: boolean;
  processed: number;
  skipped: number;
  retried: number;
  resolved: number;
  timed_out: boolean;
  errors: string[];
}> {
  const { data: sources } = await svc
    .from("email_ingest_sources")
    .select("id, tenant_id, address, settings")
    .eq("status", "active");

  const m365Sources = ((sources ?? []) as M365Source[]).filter(
    (s) => s.settings?.adapter === "microsoft_graph",
  );

  if (m365Sources.length === 0) {
    return { ok: true, processed: 0, skipped: 0, retried: 0, resolved: 0, timed_out: false, errors: [] };
  }

  await cleanupExpiredLocks(svc);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return { ok: false, processed: 0, skipped: 0, retried: 0, resolved: 0, timed_out: false, errors: ["NEXT_PUBLIC_SUPABASE_URL missing"] };
  }

  const errors: string[] = [];
  const scanStart = Date.now();
  let timedOut = false;

  // 1) Reintentos primero.
  const retryResult = await retryFailedMessages(svc, m365Sources, supabaseUrl, authKey);
  errors.push(...retryResult.errors);

  // 2) Scan normal.
  const token = await getGraphToken();
  const since = new Date(Date.now() - SCAN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let totalProcessed = 0;
  let totalSkipped = 0;

  outerLoop:
  for (const source of m365Sources) {
    const mailbox = (source.settings?.graph_mailbox_id as string | undefined) ?? source.address;
    const folder = (source.settings?.graph_folder_id as string | undefined) ?? "Inbox";
    const webhookSecret = source.settings?.webhook_secret as string | undefined;
    if (!webhookSecret) continue;

    const graphUrl = new URL(
      `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/${folder}/messages`,
    );
    graphUrl.searchParams.set("$filter", `receivedDateTime ge ${since}`);
    graphUrl.searchParams.set("$select", "id,internetMessageId,subject,receivedDateTime,from,hasAttachments");
    graphUrl.searchParams.set("$orderby", "receivedDateTime desc");
    graphUrl.searchParams.set("$top", "50");

    const graphRes = await fetch(graphUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!graphRes.ok) {
      errors.push(`${source.address}: Graph list failed (${graphRes.status})`);
      continue;
    }

    const graphData = (await graphRes.json()) as { value?: GraphMessage[] };
    const messages = graphData.value ?? [];

    for (const msg of messages) {
      // Cortar si se acerca el límite de tiempo para no dar 504.
      if (Date.now() - scanStart > SCAN_WALL_MS) {
        timedOut = true;
        break outerLoop;
      }

      if (await alreadyProcessed(svc, source.tenant_id, msg.id, msg.internetMessageId)) {
        totalSkipped++;
        continue;
      }

      const locked = await acquireLock(svc, source.tenant_id, msg.id);
      if (!locked) {
        totalSkipped++;
        continue;
      }

      try {
        const ingest = await callIngest(source, mailbox, msg.id, supabaseUrl, webhookSecret, authKey);
        if (ingest.ok) {
          totalProcessed++;
          await markResolved(svc, source.tenant_id, msg.id);
        } else {
          await recordFailure(svc, source.tenant_id, source.id, msg.id, msg.internetMessageId, ingest.error ?? "unknown");
          errors.push(`${source.address}: msg ${msg.id.slice(-12)} → ${ingest.error ?? "err"}`);
        }
      } finally {
        await releaseLock(svc, source.tenant_id, msg.id);
      }
    }
  }

  return {
    ok: errors.length === 0,
    processed: totalProcessed,
    skipped: totalSkipped,
    retried: retryResult.retried,
    resolved: retryResult.resolved,
    timed_out: timedOut,
    errors,
  };
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const svc = createServiceClient();
  const authKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!authKey) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }
  const result = await runScan(asDyn(svc), authKey);
  return NextResponse.json({ ...result, scanned_days: SCAN_DAYS });
}

export async function POST(req: NextRequest) {
  if (!isCronRequest(req)) {
    const ctx = await getTenantContext();
    if ("error" in ctx) return ctx.error;
  }
  const svc = createServiceClient();
  // El edge function valida con ?secret=, no con Authorization, así que anon key funciona.
  const authKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!authKey) {
    return NextResponse.json({ ok: false, error: "Supabase keys missing" }, { status: 500 });
  }
  try {
    const result = await runScan(asDyn(svc), authKey);
    return NextResponse.json({ ...result, scanned_days: SCAN_DAYS });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
