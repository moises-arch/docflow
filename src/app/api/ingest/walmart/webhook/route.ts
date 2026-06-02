// Walmart webhook receiver. Walmart POSTs here when PO_CREATED fires.
//
// Critical contract:
// - Validate HMAC signature (WM-SVC-SIG header) — 401 if invalid
// - Parse body, extract purchaseOrderId
// - Upsert walmart_orders row (idempotent on tenant_id + walmart_po_id)
// - Fire-and-forget POST to /api/ingest/walmart/process
// - ALWAYS return 200 to Walmart in <500ms (async processing)
//
// If processing fails, the cron rescue at /api/cron/walmart-scan-pending
// will catch it within 30 minutes.

import { createServiceClient } from "@/lib/supabase/service";
import { validateWalmartSignature } from "@/lib/walmart/webhook-signature";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

type WebhookPayload = {
  eventType?: string;
  data?: { purchaseOrderId?: string; customerOrderId?: string };
  // Some Walmart webhook variants flatten this — accept both
  purchaseOrderId?: string;
  customerOrderId?: string;
};

export async function POST(req: NextRequest) {
  const correlationId = req.headers.get("wm_qos.correlation_id") ?? randomUUID();
  const rawBody = await req.text();

  // 1. Signature validation
  const signature = req.headers.get("wm-svc-sig") ?? req.headers.get("WM-SVC-SIG");
  if (!validateWalmartSignature(rawBody, signature, process.env.WALMART_WEBHOOK_SECRET)) {
    console.warn("walmart webhook: invalid signature", { correlationId });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // 2. Parse body
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const purchaseOrderId =
    payload.data?.purchaseOrderId ?? payload.purchaseOrderId ?? null;
  const customerOrderId =
    payload.data?.customerOrderId ?? payload.customerOrderId ?? null;

  if (!purchaseOrderId) {
    return NextResponse.json({ error: "missing_purchase_order_id" }, { status: 400 });
  }

  // 3. Resolve tenant — single-tenant deployment for now, take the first.
  const svc = createServiceClient();
  const { data: tenants } = await svc
    .from("tenants")
    .select("id")
    .limit(1)
    .returns<Array<{ id: string }>>();
  const tenantId = tenants?.[0]?.id;
  if (!tenantId) {
    // Still return 200 — we can't do anything but Walmart shouldn't retry
    console.error("walmart webhook: no tenant configured", { correlationId, purchaseOrderId });
    return NextResponse.json({ ok: true, reason: "no_tenant" }, { status: 200 });
  }

  // 4. Upsert walmart_orders (idempotent)
  await (
    svc.from("walmart_orders") as unknown as {
      upsert: (
        v: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: { message?: string } | null }>;
    }
  ).upsert(
    {
      tenant_id: tenantId,
      walmart_po_id: purchaseOrderId,
      customer_order_id: customerOrderId,
      state: "pending",
      source: "webhook",
      meta: { correlation_id: correlationId, event_type: payload.eventType ?? "PO_CREATED" },
    },
    { onConflict: "tenant_id,walmart_po_id" },
  );

  // 5. Fire-and-forget dispatch to process. Don't wait for result.
  const baseUrl = process.env.INTAKE_PUBLIC_APP_URL;
  const internalToken = process.env.INTAKE_WALMART_INTERNAL_TOKEN;
  if (baseUrl && internalToken) {
    fetch(`${baseUrl}/api/ingest/walmart/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-walmart-internal-token": internalToken,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        walmart_po_id: purchaseOrderId,
        correlation_id: correlationId,
      }),
      signal: AbortSignal.timeout(2000),
    }).catch(() => {
      // If dispatch fails, the cron rescues. We've already returned 200.
    });
  }

  return NextResponse.json({ ok: true, correlationId }, { status: 200 });
}
