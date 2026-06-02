// Worker que procesa TODAS las órdenes pending en un solo loop secuencial.
// Sin auto-chaining — un solo invocation procesa toda la cola.
// Evita el bug anterior: after(() => void fetch()) no retornaba la promesa
// y after() terminaba antes de que el worker arrancara.
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runCleoJob } from "@/lib/cleo/runner";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const expected = process.env.INTAKE_CLEO_INTERNAL_TOKEN;
  if (!expected) return false;
  return req.headers.get("x-cleo-internal-token") === expected;
}

type OrderRow = {
  id: string;
  cleo_message_id: string;
  cleo_reference: string | null;
  cleo_batch_id: string | null;
  trading_partner: string | null;
  inbound_email_id: string | null;
};

type DynClient = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => {
          order: (c: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: OrderRow[] | null }>;
          };
        };
      };
    };
    update: (v: Record<string, unknown>) => {
      eq: (c: string, v: string) => Promise<unknown>;
    };
  };
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tenant_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = body.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenant_id" }, { status: 422 });
  }

  const supabase = createServiceClient();
  const db = supabase as unknown as DynClient;

  const results: Array<{ cleo_message_id: string; ok: boolean; reason?: string }> = [];
  const startedAt = Date.now();
  const WALL_MS = 260_000; // 260s — margen antes del maxDuration de 300s

  // Loop: tomar la siguiente orden pending y procesarla hasta vaciar la cola
  while (Date.now() - startedAt < WALL_MS) {
    const { data: pending } = await db
      .from("cleo_orders")
      .select("id,cleo_message_id,cleo_reference,cleo_batch_id,trading_partner,inbound_email_id")
      .eq("tenant_id", tenantId)
      .eq("state", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    const order = pending?.[0] ?? null;
    if (!order) break; // Cola vacía

    await db
      .from("cleo_orders")
      .update({ state: "running" })
      .eq("id", order.id);

    const result = await runCleoJob({
      tenant_id: tenantId,
      inbound_email_id: order.inbound_email_id,
      cleo_message_id: order.cleo_message_id,
      cleo_reference: order.cleo_reference ?? "",
      cleo_batch_id: order.cleo_batch_id ?? "",
      trading_partner: order.trading_partner,
      subject: null,
      from_email: "",
    });

    results.push({
      cleo_message_id: order.cleo_message_id,
      ok: result.ok,
      reason: result.ok ? undefined : result.reason,
    });
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({ done: true, processed: results.length, succeeded, failed, results });
}
