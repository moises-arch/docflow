// Devuelve conteo de órdenes fallidas en Cleo y Rithum para el tenant actual.
// Usado por el Inbox y el Dashboard principal para mostrar alertas de integración.
import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const db = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string, opts?: { count: "exact"; head: boolean }) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => Promise<{ count: number | null }>;
        };
      };
    };
  };

  const [{ count: cleoFailed }, { count: rithumFailed }] = await Promise.all([
    db.from("cleo_orders").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("state", "failed"),
    db.from("rithum_orders").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("state", "failed"),
  ]);

  return NextResponse.json({
    cleo_failed: cleoFailed ?? 0,
    rithum_failed: rithumFailed ?? 0,
  });
}
