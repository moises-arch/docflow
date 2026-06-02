// Setup endpoint to subscribe Walmart's PO_CREATED webhook to our URL.
// Run manually after deploy (or once per env). Idempotent — checks existing
// subscriptions first and skips if already active.

import { createServiceClient } from "@/lib/supabase/service";
import {
  listWebhookSubscriptions,
  subscribeWebhook,
} from "@/lib/walmart/api/notifications";
import { updateWalmartSettings } from "@/lib/walmart/settings";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const correlationId = randomUUID();
    const baseUrl = process.env.INTAKE_PUBLIC_APP_URL ?? "https://app.example.com";
    const destinationUrl = `${baseUrl}/api/ingest/walmart/webhook`;

    // Check existing
    const { subscriptions } = await listWebhookSubscriptions(correlationId);
    const existing = subscriptions.find(
      (s) => s.eventType === "PO_CREATED" && s.destinationUrl === destinationUrl,
    );

    if (existing && existing.status === "ACTIVE") {
      return NextResponse.json({
        ok: true,
        reason: "already_subscribed",
        subscription_id: existing.subscriptionId,
      });
    }

    // Create new subscription
    const result = await subscribeWebhook({
      eventType: "PO_CREATED",
      destinationUrl,
      correlationId,
    });

    // Persist subscription_id in tenant settings
    const svc = createServiceClient();
    const { data: tenants } = await svc
      .from("tenants")
      .select("id")
      .limit(1)
      .returns<Array<{ id: string }>>();
    const tenantId = tenants?.[0]?.id;
    if (tenantId) {
      await updateWalmartSettings(tenantId, {
        webhook_subscription_id: result.subscriptionId,
      });
    }

    return NextResponse.json({
      ok: true,
      subscription_id: result.subscriptionId,
      destination_url: destinationUrl,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const body = (err as { body?: string }).body ?? null;
    console.error("walmart-subscribe-webhook failed:", detail, body);
    return NextResponse.json(
      { ok: false, error: detail, walmart_response: body },
      { status: 500 },
    );
  }
}
