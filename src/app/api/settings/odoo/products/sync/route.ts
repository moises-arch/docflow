export const maxDuration = 60;
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  if (membership.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: run, error: runError } = await service
    .from("odoo_sync_runs")
    .insert({
      tenant_id: membership.tenant_id,
      scope: "products",
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

  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/odoo-sync-products`;
  const edgeRes = await fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ tenant_id: membership.tenant_id, run_id: run.id }),
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
      {
        error: body.error ?? "Product sync failed",
        detail: body.detail,
      },
      { status: edgeRes.status },
    );
  }

  return NextResponse.json(body);
}
