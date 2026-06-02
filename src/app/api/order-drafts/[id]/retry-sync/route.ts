export const maxDuration = 60;
import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { checkAndConsume, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const tenantId = membership.tenant_id;

  // Rate limit: 30 retries/h per tenant.
  const rl = await checkAndConsume({
    tenantId,
    key: "retry-sync",
    capacity: 30,
    refillPerHour: 30,
  });
  const rlResp = rateLimitResponse(rl);
  if (rlResp) return rlResp;

  const { data: draft } = await supabase
    .from("order_drafts")
    .select("id, sync_state, updated_at")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!draft) {
    return NextResponse.json({ error: "Order draft not found" }, { status: 404 });
  }

  // Allow retry from sync_failed and pending (idempotent in odoo-sync).
  // Also allow retry from in_progress if stuck >3min (Edge Function died mid-run).
  const isStuckInProgress =
    draft.sync_state === "in_progress" &&
    draft.updated_at &&
    Date.now() - new Date(draft.updated_at).getTime() > 3 * 60 * 1000;
  const canRetry =
    draft.sync_state === "sync_failed" ||
    draft.sync_state === "pending" ||
    isStuckInProgress;

  if (!canRetry) {
    return NextResponse.json(
      { error: `Cannot retry sync from state '${draft.sync_state}'` },
      { status: 409 },
    );
  }

  const service = createServiceClient();
  const serviceUntyped = service as unknown as DynamicSupabaseClient;
  const runId = crypto.randomUUID();

  const { error: updateError } = await service
    .from("order_drafts")
    .update({ sync_state: "pending", last_sync_error: null })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to queue sync retry" }, { status: 500 });
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    const errorMessage = "Missing Supabase runtime env for odoo-sync trigger";
    await service
      .from("order_drafts")
      .update({ sync_state: "sync_failed", last_sync_error: errorMessage })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    await serviceUntyped.from("odoo_sync_attempts").insert({
      tenant_id: tenantId,
      order_draft_id: id,
      run_id: runId,
      outcome: "error",
      odoo_so_id: null,
      odoo_so_name: null,
      error_message: errorMessage,
    });
    return NextResponse.json({ ok: false, sync_state: "sync_failed" });
  }

  const fnUrl = `${supabaseUrl}/functions/v1/odoo-sync`;
  try {
    const response = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ order_draft_id: id, tenant_id: tenantId, run_id: runId }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!response.ok) {
      const body = await response.text();
      const errorMessage = `odoo-sync trigger responded ${response.status}: ${body}`.slice(0, 1000);

      await service
        .from("order_drafts")
        .update({ sync_state: "sync_failed", last_sync_error: errorMessage })
        .eq("id", id)
        .eq("tenant_id", tenantId);

      await serviceUntyped.from("odoo_sync_attempts").insert({
        tenant_id: tenantId,
        order_draft_id: id,
        run_id: runId,
        outcome: "error",
        odoo_so_id: null,
        odoo_so_name: null,
        error_message: errorMessage,
      });

      return NextResponse.json(
        { ok: false, sync_state: "sync_failed", error: errorMessage },
        { status: 502 },
      );
    }
  } catch (e: unknown) {
    console.error("[retry-sync] odoo-sync trigger timed out or failed:", e);
  }

  return NextResponse.json({ ok: true, sync_state: "pending" });
}
