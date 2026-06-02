// Manual acknowledge of a Walmart order. Removes it from the released
// bucket on Walmart's side. Idempotent.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { acknowledgeOrder } from "@/lib/walmart/api/orders";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  const svc = createServiceClient();
  const { data } = await svc
    .from("walmart_orders")
    .select("id, walmart_po_id, acknowledged_at")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .limit(1)
    .returns<Array<{ id: string; walmart_po_id: string; acknowledged_at: string | null }>>();
  const row = data?.[0];
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (row.acknowledged_at) {
    return NextResponse.json({ ok: true, reason: "already_acknowledged" });
  }

  try {
    await acknowledgeOrder(row.walmart_po_id, randomUUID());
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // 400/409/422 = order already acknowledged or wrong state — not a real error
    const status = (err as { status?: number }).status ?? 500;
    if (status >= 400 && status < 500) {
      // Already acknowledged on Walmart's side — mark local row as acked too
      await (
        svc.from("walmart_orders") as unknown as {
          update: (v: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<{ error: unknown }>;
          };
        }
      )
        .update({ acknowledged_at: new Date().toISOString() })
        .eq("id", row.id);
      return NextResponse.json({ ok: true, reason: `already_acked:${reason}` });
    }
    return NextResponse.json({ ok: false, reason }, { status: 500 });
  }
  await (
    svc.from("walmart_orders") as unknown as {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: string) => Promise<{ error: unknown }>;
      };
    }
  )
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", row.id);
  return NextResponse.json({ ok: true });
}
