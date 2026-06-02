import { NextResponse } from "next/server";
import { getIntegrationContext } from "@/app/api/integrations/_lib";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST() {
  const context = await getIntegrationContext({ ownerOnly: true });
  if ("error" in context) return context.error;

  const service = createServiceClient();
  const { data: run, error: runError } = await service
    .from("odoo_sync_runs")
    .insert({
      tenant_id: context.tenantId,
      scope: "schema",
      trigger: "manual",
    })
    .select("id")
    .single();

  if (runError || !run) {
    return NextResponse.json(
      { error: "Failed to create sync run", detail: runError?.message },
      { status: 500 },
    );
  }

  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/odoo-sync-schema`;
  const edgeRes = await fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ tenant_id: context.tenantId, run_id: run.id }),
  });

  const body = (await edgeRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!edgeRes.ok) {
    await service
      .from("odoo_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: false,
        error: String(body.error ?? body.detail ?? "edge function call failed").slice(0, 500),
      })
      .eq("id", run.id)
      .is("finished_at", null);
    return NextResponse.json(
      { error: body.error ?? "Schema sync failed", detail: body.detail },
      { status: edgeRes.status },
    );
  }

  return NextResponse.json(body);
}
