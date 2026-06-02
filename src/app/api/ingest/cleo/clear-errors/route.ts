// Borra todas las cleo_orders con state=failed del tenant.
// Equivalente a "limpiar historial de errores" — los fallidos sin documento
// asociado no tienen valor y ensucian la vista.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  const svc = createServiceClient();
  const { error, count } = await svc
    .from("cleo_orders")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("state", "failed");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
