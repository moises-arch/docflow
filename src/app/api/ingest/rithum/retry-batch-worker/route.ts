// Worker que procesa TODAS las órdenes Rithum pending en un solo loop.
// Sin auto-chaining con after() — procesa toda la cola en un invocation.
// Mismo patrón aplicado al worker de Cleo.
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runRithumJob } from "@/lib/rithum/runner";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const expected = process.env.INTAKE_RITHUM_INTERNAL_TOKEN;
  if (!expected) return false;
  return req.headers.get("x-rithum-internal-token") === expected;
}

type OrderRow = {
  id: string;
  rithum_order_number: string;
  rithum_partner: string | null;
  rithum_partner_pid: string | null;
  rithum_order_date: string | null;
  inbound_email_id: string;
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

function partnerPid(partner: string | null): "thehomedepot" | "thdso" | "walmartmp" | null {
  const p = (partner ?? "").toLowerCase();
  if (p.includes("home depot special")) return "thdso";
  if (p.includes("home depot")) return "thehomedepot";
  if (p.includes("walmart")) return "walmartmp";
  return null;
}

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

  const results: Array<{ order: string; ok: boolean; reason?: string }> = [];
  const startedAt = Date.now();
  const WALL_MS = 260_000; // 260s — margen antes del maxDuration de 300s

  // Loop: tomar la siguiente orden pending y procesarla hasta vaciar la cola
  while (Date.now() - startedAt < WALL_MS) {
    const { data: pending } = await db
      .from("rithum_orders")
      .select("id,rithum_order_number,rithum_partner,rithum_partner_pid,rithum_order_date,inbound_email_id")
      .eq("tenant_id", tenantId)
      .eq("state", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    const order = pending?.[0] ?? null;
    if (!order) break; // Cola vacía

    // Marcar como running para evitar doble-claim
    await db
      .from("rithum_orders")
      .update({ state: "running" })
      .eq("id", order.id);

    const result = await runRithumJob({
      tenant_id: tenantId,
      inbound_email_id: order.inbound_email_id,
      rithum_order_number: order.rithum_order_number,
      rithum_partner: order.rithum_partner ?? "",
      rithum_partner_pid: partnerPid(order.rithum_partner),
      rithum_order_date: order.rithum_order_date,
      subject: null,
      from_email: "",
    });

    results.push({
      order: order.rithum_order_number,
      ok: result.ok,
      reason: result.ok ? undefined : result.reason,
    });
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({ done: true, processed: results.length, succeeded, failed, results });
}
