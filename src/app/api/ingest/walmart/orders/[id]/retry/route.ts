// Manual retry of a failed Walmart order. Resets state and re-dispatches.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  const svc = createServiceClient();
  const { data } = await svc
    .from("walmart_orders")
    .select("id, walmart_po_id, state")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .limit(1)
    .returns<Array<{ id: string; walmart_po_id: string; state: string }>>();
  const row = data?.[0];
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Reset state
  await (
    svc.from("walmart_orders") as unknown as {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: string) => Promise<{ error: unknown }>;
      };
    }
  )
    .update({ state: "pending", attempts: 0, last_error: null })
    .eq("id", row.id);

  // Dispatch to process
  const baseUrl = process.env.INTAKE_PUBLIC_APP_URL ?? "https://app.example.com";
  const token = process.env.INTAKE_WALMART_INTERNAL_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "internal_token_not_configured" }, { status: 503 });
  }

  const r = await fetch(`${baseUrl}/api/ingest/walmart/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-walmart-internal-token": token },
    body: JSON.stringify({
      tenant_id: tenantId,
      walmart_po_id: row.walmart_po_id,
      correlation_id: randomUUID(),
    }),
  });
  const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  return NextResponse.json(body ?? { ok: r.ok }, { status: r.status });
}
