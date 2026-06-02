import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { computeNextCron } from "@/lib/odoo/cron-schedule";

type Scope = "products" | "catalog" | "schema";

type RunRow = {
  scope: Scope;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  imported: number | null;
  deactivated: number | null;
  error: string | null;
};

type ScopeStatus = {
  last_ok: { finished_at: string; imported: number | null; deactivated: number | null } | null;
  last_attempt: { started_at: string; ok: boolean | null; error: string | null } | null;
  next_cron_at: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const tenantId = membership.tenant_id;
  const service = createServiceClient();

  const scopes: Scope[] = ["products", "catalog", "schema"];
  const result: Record<Scope, ScopeStatus> = {
    products: { last_ok: null, last_attempt: null, next_cron_at: null },
    catalog: { last_ok: null, last_attempt: null, next_cron_at: null },
    schema: { last_ok: null, last_attempt: null, next_cron_at: null },
  };

  for (const scope of scopes) {
    const { data } = await service
      .from("odoo_sync_runs")
      .select("scope, started_at, finished_at, ok, imported, deactivated, error")
      .eq("tenant_id", tenantId)
      .eq("scope", scope)
      .order("started_at", { ascending: false })
      .limit(5)
      .returns<RunRow[]>();

    const runs = data ?? [];
    const lastAttempt = runs[0] ?? null;
    const lastOk = runs.find((r) => r.ok === true) ?? null;

    result[scope] = {
      last_ok: lastOk
        ? {
            finished_at: lastOk.finished_at ?? lastOk.started_at,
            imported: lastOk.imported,
            deactivated: lastOk.deactivated,
          }
        : null,
      last_attempt: lastAttempt
        ? {
            started_at: lastAttempt.started_at,
            ok: lastAttempt.ok,
            error: lastAttempt.error,
          }
        : null,
      next_cron_at: scope === "products" ? computeNextCron(new Date()).toISOString() : null,
    };
  }

  return NextResponse.json({ scopes: result });
}
