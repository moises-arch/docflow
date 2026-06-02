import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { requireSettingsAccess } from "../../../settings/_lib";
import {
  EmailMicrosoftClient,
  type MsSource,
  type HealthCheckSummary,
  type FailedMessageSummary,
} from "./email-microsoft-client";

export default async function Microsoft365EmailIngestPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const db = supabase as unknown as DynamicSupabaseClient;

  const [{ data: rawSources }, { data: providers }] = await Promise.all([
    db
      .from<
        Array<{
          id: string;
          provider_id: string | null;
          address: string;
          status: "active" | "paused" | "archived";
          settings: Record<string, unknown> | null;
          created_at: string;
        }>
      >("email_ingest_sources")
      .select("id, provider_id, address, status, settings, created_at")
      .eq("tenant_id", tenantId)
      .eq("settings->>adapter", "microsoft_graph")
      .not("status", "eq", "archived")
      .order("created_at", { ascending: false }),
    db
      .from<Array<{ id: string; name: string }>>("providers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true }),
  ]);

  const sources: MsSource[] = (rawSources ?? []).map((row) => {
    const s = (row.settings ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      provider_id: row.provider_id,
      address: row.address,
      status: row.status,
      created_at: row.created_at,
      graph_subscription_id:
        typeof s.graph_subscription_id === "string" ? (s.graph_subscription_id as string) : null,
      graph_subscription_expires_at:
        typeof s.graph_subscription_expires_at === "string"
          ? (s.graph_subscription_expires_at as string)
          : null,
      allowed_mime_types: Array.isArray(s.allowed_mime_types) ? (s.allowed_mime_types as string[]) : ["application/pdf"],
      last_error: typeof s.last_error === "string" ? (s.last_error as string) : null,
      last_error_at: typeof s.last_error_at === "string" ? (s.last_error_at as string) : null,
    };
  });

  // Última fila de healthcheck por source.
  const healthBySource: Record<string, HealthCheckSummary> = {};
  if (sources.length > 0) {
    const { data: healthRows } = await db
      .from<
        Array<{
          source_id: string | null;
          ok: boolean;
          checks: Record<string, unknown>;
          error: string | null;
          created_at: string;
        }>
      >("m365_health_checks")
      .select("source_id, ok, checks, error, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    for (const row of healthRows ?? []) {
      if (row.source_id && !healthBySource[row.source_id]) {
        healthBySource[row.source_id] = {
          ok: row.ok,
          checks: row.checks ?? {},
          error: row.error,
          created_at: row.created_at,
        };
      }
    }
  }

  // Failed messages no resueltos en últimas 24h.
  const failedBySource: Record<string, FailedMessageSummary> = {};
  if (sources.length > 0) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: failedRows } = await db
      .from<
        Array<{
          source_id: string;
          attempts: number;
        }>
      >("m365_failed_messages")
      .select("source_id, attempts")
      .eq("tenant_id", tenantId)
      .is("resolved_at", null)
      .gte("last_attempt_at", since);
    for (const row of failedRows ?? []) {
      const cur = failedBySource[row.source_id] ?? { count: 0, max_attempts: 0 };
      cur.count += 1;
      cur.max_attempts = Math.max(cur.max_attempts, row.attempts);
      failedBySource[row.source_id] = cur;
    }
  }

  // Conteo de emails 24h por source.
  const messages24hBySource: Record<string, number> = {};
  if (sources.length > 0) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    for (const s of sources) {
      const { data: rows } = await db
        .from<Array<{ id: string }>>("inbound_emails")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("ingest_source_id", s.id)
        .gte("received_at", since);
      messages24hBySource[s.id] = (rows ?? []).length;
    }
  }

  const azureConfigured = Boolean(
    process.env.MICROSOFT_GRAPH_TENANT_ID &&
      process.env.MICROSOFT_GRAPH_CLIENT_ID &&
      process.env.MICROSOFT_GRAPH_CLIENT_SECRET,
  );

  return (
    <EmailMicrosoftClient
      sources={sources}
      inboundEmails={[]}
      providers={providers ?? []}
      azureConfigured={azureConfigured}
      healthBySource={healthBySource}
      failedBySource={failedBySource}
      messages24hBySource={messages24hBySource}
    />
  );
}
