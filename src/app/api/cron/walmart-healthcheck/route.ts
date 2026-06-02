// Walmart deep healthcheck cron — every 6h.
// Verifies token + orders endpoint + DB tables. If any fails, the dashboard
// will show it in red on next page load (smoke_runs has the trail).

import { createServiceClient } from "@/lib/supabase/service";
import { getAccessToken, _resetTokenCacheForTesting } from "@/lib/walmart/client";
import { getReleasedOrders } from "@/lib/walmart/api/orders";
import { listWebhookSubscriptions } from "@/lib/walmart/api/notifications";
import { createNotification } from "@/lib/notifications/create";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

type Step = { name: string; ok: boolean; ms: number; detail?: string };

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function runStep<T>(
  steps: Step[],
  name: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const start = Date.now();
  try {
    const result = await fn();
    steps.push({ name, ok: true, ms: Date.now() - start });
    return result;
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    steps.push({ name, ok: false, ms: Date.now() - start, detail: detail.slice(0, 250) });
    return null;
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const correlationId = randomUUID();
  const steps: Step[] = [];

  await runStep(steps, "env_credentials", async () => {
    if (!process.env.WALMART_CLIENT_ID) throw new Error("WALMART_CLIENT_ID missing");
    if (!process.env.WALMART_CLIENT_SECRET) throw new Error("WALMART_CLIENT_SECRET missing");
    return true;
  });

  await runStep(steps, "token_refresh", async () => {
    _resetTokenCacheForTesting();
    const t = await getAccessToken(correlationId);
    if (!t || t.length < 50) throw new Error("invalid_token");
    return t.length;
  });

  await runStep(steps, "orders_endpoint", async () => {
    const r = await getReleasedOrders({ limit: 1, correlationId });
    return r.list?.meta?.totalCount ?? 0;
  });

  await runStep(steps, "webhook_subscriptions", async () => {
    const r = await listWebhookSubscriptions(correlationId);
    return r.subscriptions?.length ?? 0;
  });

  const svc = createServiceClient();
  await runStep(steps, "db_walmart_orders", async () => {
    const { error } = await svc.from("walmart_orders").select("id").limit(1);
    if (error) throw new Error(error.message);
    return true;
  });

  const ok = steps.every((s) => s.ok);

  // Persist
  const { data: tenants } = await svc
    .from("tenants")
    .select("id")
    .limit(1)
    .returns<Array<{ id: string }>>();
  const tenantId = tenants?.[0]?.id ?? null;

  if (tenantId) {
    await svc.from("walmart_smoke_runs").insert({
      tenant_id: tenantId,
      ok,
      checks: steps.map((s) => ({
        name: s.name,
        ok: s.ok,
        detail: s.detail ?? `${s.ms}ms`,
        ms: s.ms,
      })),
    });

    if (!ok) {
      const firstFailed = steps.find((s) => !s.ok);
      const description = firstFailed?.detail
        ? firstFailed.detail.slice(0, 200)
        : "Un paso del healthcheck falló";
      await createNotification({
        tenantId,
        source: "healthcheck",
        severity: "error",
        title: "Walmart healthcheck falló",
        description,
        href: null,
      });
    }
  }

  return NextResponse.json(
    { ok, ran_at: new Date().toISOString(), steps },
    { status: ok ? 200 : 503 },
  );
}
