import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type SessionState = "ok" | "stale" | "unknown";

type IntegrationStatus = {
  enabled: boolean;
  last_healthcheck: {
    ok: boolean;
    finished_at: string;
    summary: string | null;
  } | null;
  last_order_at: string | null;
  orders_last_24h: number;
  session_state: SessionState;
};

type HealthPayload = {
  overall_ok: boolean;
  rithum: IntegrationStatus;
  cleo: IntegrationStatus;
  walmart: IntegrationStatus;
  m365: IntegrationStatus;
};

const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

type SmokeCheck = { name?: string; ok?: boolean; detail?: string };

function summaryFromChecks(checks: SmokeCheck[] | null | undefined): string | null {
  if (!checks?.length) return null;
  const failed = checks.find((c) => c.ok === false);
  if (!failed) return null;
  return `${failed.name ?? "check"}: ${failed.detail ?? "failed"}`;
}

async function readProviderStatus(params: {
  tenantId: string;
  smokeTable: "rithum_smoke_runs" | "cleo_smoke_runs" | "walmart_smoke_runs";
  ordersTable: "rithum_orders" | "cleo_orders" | "walmart_orders";
  enabled: boolean;
  sessionState: SessionState;
}): Promise<IntegrationStatus> {
  const svc = createServiceClient();
  const since = new Date(Date.now() - TWENTY_FOUR_H).toISOString();

  const smokeQuery = (svc as unknown as {
    from: (t: string) => {
      select: (q: string) => {
        eq: (k: string, v: string) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{
                data: { ok: boolean; created_at: string; checks?: SmokeCheck[] } | null;
              }>;
            };
          };
        };
      };
    };
  })
    .from(params.smokeTable)
    .select("ok, created_at, checks")
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastOrderQuery = (svc as unknown as {
    from: (t: string) => {
      select: (q: string) => {
        eq: (k: string, v: string) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{ data: { created_at: string } | null }>;
            };
          };
        };
      };
    };
  })
    .from(params.ordersTable)
    .select("created_at")
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const countQuery = (svc as unknown as {
    from: (t: string) => {
      select: (
        q: string,
        opts: { count: "exact"; head: true },
      ) => {
        eq: (k: string, v: string) => {
          gt: (c: string, v: string) => Promise<{ count: number | null }>;
        };
      };
    };
  })
    .from(params.ordersTable)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", params.tenantId)
    .gt("created_at", since);

  const [smokeRes, lastOrderRes, countRes] = await Promise.all([
    smokeQuery,
    lastOrderQuery,
    countQuery,
  ]);

  const last_healthcheck = smokeRes.data
    ? {
        ok: smokeRes.data.ok,
        finished_at: smokeRes.data.created_at,
        summary: summaryFromChecks(smokeRes.data.checks),
      }
    : null;

  return {
    enabled: params.enabled,
    last_healthcheck,
    last_order_at: lastOrderRes.data?.created_at ?? null,
    orders_last_24h: countRes.count ?? 0,
    session_state: params.sessionState,
  };
}

async function readM365Status(tenantId: string): Promise<IntegrationStatus> {
  const svc = createServiceClient();
  const since = new Date(Date.now() - TWENTY_FOUR_H).toISOString();

  // M365: no smoke_runs dedicada. Inferimos health del último renew + el conteo de subscriptions activas.
  // Las "órdenes" para M365 son los emails procesados — usamos `inbound_emails` si existe.
  const enabled = Boolean(process.env.MS_GRAPH_CLIENT_ID && process.env.MS_GRAPH_CLIENT_SECRET);

  // Último email procesado (best-effort)
  const lastEmailQ = (svc as unknown as {
    from: (t: string) => {
      select: (q: string) => {
        eq: (k: string, v: string) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => {
            limit: (n: number) => Promise<{
              data: Array<{ created_at: string }> | null;
              error: unknown;
            }>;
          };
        };
      };
    };
  })
    .from("inbound_emails")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1);

  const countQ = (svc as unknown as {
    from: (t: string) => {
      select: (
        q: string,
        opts: { count: "exact"; head: true },
      ) => {
        eq: (k: string, v: string) => {
          gt: (c: string, v: string) => Promise<{ count: number | null }>;
        };
      };
    };
  })
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gt("created_at", since);

  const [lastEmailRes, countRes] = await Promise.all([lastEmailQ, countQ]);
  const lastEmail = lastEmailRes.data?.[0]?.created_at ?? null;

  return {
    enabled,
    last_healthcheck: null, // requiere endpoint dedicado, no tenemos tabla
    last_order_at: lastEmail,
    orders_last_24h: countRes.count ?? 0,
    session_state: "unknown",
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const tenantId = membership.tenant_id;

  const [rithum, cleo, walmart, m365] = await Promise.all([
    readProviderStatus({
      tenantId,
      smokeTable: "rithum_smoke_runs",
      ordersTable: "rithum_orders",
      enabled: Boolean(process.env.RITHUM_USERNAME && process.env.RITHUM_PASSWORD),
      sessionState: "unknown",
    }),
    readProviderStatus({
      tenantId,
      smokeTable: "cleo_smoke_runs",
      ordersTable: "cleo_orders",
      enabled: Boolean(process.env.CLEO_USERNAME && process.env.CLEO_PASSWORD),
      sessionState: "unknown",
    }),
    readProviderStatus({
      tenantId,
      smokeTable: "walmart_smoke_runs",
      ordersTable: "walmart_orders",
      enabled: Boolean(process.env.WALMART_CLIENT_ID && process.env.WALMART_CLIENT_SECRET),
      sessionState: "unknown",
    }),
    readM365Status(tenantId),
  ]);

  const statuses = [rithum, cleo, walmart, m365];
  const overall_ok = statuses.every((s) => !s.enabled || s.last_healthcheck?.ok !== false);

  const payload: HealthPayload = { overall_ok, rithum, cleo, walmart, m365 };
  return NextResponse.json(payload);
}
