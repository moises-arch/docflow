export const maxDuration = 60;
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

  // Rate limit: 20 address fixes per hour per tenant
  const rl = await checkAndConsume({
    tenantId,
    key: "fix-odoo-addresses",
    capacity: 20,
    refillPerHour: 20,
  });
  const rlResp = rateLimitResponse(rl);
  if (rlResp) return rlResp;

  const { data: draft } = await supabase
    .from("order_drafts")
    .select("id, sync_state, odoo_so_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!draft) {
    return NextResponse.json({ error: "Order draft not found" }, { status: 404 });
  }

  if (draft.sync_state !== "synced" || !draft.odoo_so_id) {
    return NextResponse.json(
      { error: "Order must be synced and have an Odoo SO to fix addresses" },
      { status: 409 },
    );
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase runtime env" }, { status: 500 });
  }

  const service = createServiceClient();

  try {
    const fnUrl = `${supabaseUrl}/functions/v1/odoo-fix-addresses`;
    const response = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ order_draft_id: id, tenant_id: tenantId }),
      signal: AbortSignal.timeout(55_000),
    });

    const body = (await response.json()) as {
      ok?: boolean;
      error?: string;
      partner_shipping_id?: number;
      partner_invoice_id?: number;
    };

    if (!response.ok || !body.ok) {
      const errorMessage = body.error ?? `Function responded ${response.status}`;
      console.error("[fix-odoo-addresses] edge function error:", errorMessage);
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }

    // Log the fix attempt (best-effort)
    try {
      await service.from("odoo_sync_attempts").insert({
        tenant_id: tenantId,
        order_draft_id: id,
        run_id: crypto.randomUUID(),
        outcome: "success",
        odoo_so_id: draft.odoo_so_id,
        odoo_so_name: null,
        error_message: "Address fix applied from DocFlow",
      });
    } catch {
      // non-fatal
    }

    return NextResponse.json({
      ok: true,
      partner_shipping_id: body.partner_shipping_id,
      partner_invoice_id: body.partner_invoice_id,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[fix-odoo-addresses] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
