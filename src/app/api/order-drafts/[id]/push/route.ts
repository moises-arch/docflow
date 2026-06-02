// Bypass push endpoint — used by the QR mobile app (auto) and by the manual
// approval queue. Skips soft validations (buyer/provider unresolved, required
// fields, country normalization). Keeps hard guards: active Odoo connection,
// at least one line, and duplicate-PO unless force_duplicate_po=true.
//
// Always returns 200 with the final sync_state. If odoo-sync fails the draft
// is marked sync_failed and the user retries from the queue.
export const maxDuration = 60;

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type DraftRow = {
  id: string;
  document_id: string;
  provider_id: string | null;
  po_number: string | null;
  sync_state: string | null;
  meta: Record<string, unknown> | null;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let forceDuplicatePo = false;
  let actorOverride: string | null = null;
  try {
    const body = (await req.json().catch(() => null)) as
      | { force_duplicate_po?: unknown; actor_user_id?: unknown }
      | null;
    if (body?.force_duplicate_po === true) forceDuplicatePo = true;
    if (typeof body?.actor_user_id === "string") actorOverride = body.actor_user_id;
  } catch {
    /* body optional */
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  // Two callers: the logged-in user from the queue UI (cookie session) OR
  // ai-process / odoo-sync edges using the service role with actor_user_id.
  const isServiceCall =
    req.headers.get("authorization") === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;

  let userId: string | null = null;
  let tenantId: string | null = null;

  if (isServiceCall) {
    const service = createServiceClient();
    const { data: draftTenant } = await service
      .from("order_drafts")
      .select("tenant_id")
      .eq("id", id)
      .maybeSingle();
    tenantId = (draftTenant as { tenant_id?: string } | null)?.tenant_id ?? null;
    userId = actorOverride ?? null;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;

    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();
    tenantId = (membership as { tenant_id?: string } | null)?.tenant_id ?? null;
  }

  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const service = createServiceClient();

  const { data: draft } = await service
    .from("order_drafts")
    .select("id, document_id, provider_id, po_number, sync_state, meta")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single<DraftRow>();

  if (!draft) {
    return NextResponse.json({ error: "Order draft not found" }, { status: 404 });
  }

  // ── Hard gate 1: at least one line ─────────────────────────────────────
  const { count: lineCount } = await service
    .from("order_draft_lines")
    .select("*", { count: "exact", head: true })
    .eq("order_draft_id", id)
    .eq("tenant_id", tenantId);

  if (!lineCount || lineCount < 1) {
    return NextResponse.json(
      { error: "no_lines", detail: "Draft has no lines — cannot push to Odoo" },
      { status: 422 },
    );
  }

  // ── Hard gate 2: active Odoo connection ────────────────────────────────
  const { data: odooConnection } = await service
    .from("odoo_connections")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!odooConnection || (odooConnection as { status?: string }).status !== "active") {
    return NextResponse.json(
      { error: "odoo_connection_inactive", detail: "Configure and verify Odoo first" },
      { status: 422 },
    );
  }

  // ── Hard gate 3: duplicate PO (overridable) ────────────────────────────
  if (draft.po_number && !forceDuplicatePo) {
    type DupeRow = { id: string; sync_state: string; odoo_so_name: string | null };
    const { data: dupesRaw } = await service
      .from("order_drafts")
      .select("id, sync_state, odoo_so_name")
      .eq("tenant_id", tenantId)
      .eq("po_number", draft.po_number)
      .in("sync_state", ["pending", "in_progress", "synced"])
      .returns<DupeRow[]>();
    const dupes = (dupesRaw ?? []).filter((row) => row.id !== id);
    if (dupes.length > 0) {
      const existing = dupes[0];
      return NextResponse.json(
        {
          error: "duplicate_po_number",
          detail: `PO ${draft.po_number} already exists${
            existing.odoo_so_name ? ` (Odoo: ${existing.odoo_so_name})` : ""
          }.`,
          existing_draft_id: existing.id,
          existing_sync_state: existing.sync_state,
          existing_odoo_so_name: existing.odoo_so_name,
        },
        { status: 409 },
      );
    }
  }

  // ── Race guard: only flip if not already in active sync ────────────────
  const approvedAt = new Date().toISOString();
  const runId = crypto.randomUUID();

  const mergedMeta = {
    ...(draft.meta && typeof draft.meta === "object" ? draft.meta : {}),
    bypass: true,
    bypassed_at: approvedAt,
    bypass_source: isServiceCall ? "auto_qr" : "manual_queue",
  };

  const draftUpdateResp = await service
    .from("order_drafts")
    .update({
      sync_state: "pending",
      approved_by: userId,
      approved_at: approvedAt,
      last_sync_error: null,
      meta: mergedMeta,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .not("sync_state", "in", "(pending,in_progress,synced)")
    .select("id");

  if (draftUpdateResp.error) {
    return NextResponse.json({ error: "Failed to flip draft" }, { status: 500 });
  }
  if (!draftUpdateResp.data || draftUpdateResp.data.length === 0) {
    return NextResponse.json(
      { error: "already_approved", detail: "Draft already in active sync state" },
      { status: 409 },
    );
  }

  await service
    .from("documents")
    .update({ state: "reviewed", last_error: null })
    .eq("id", draft.document_id)
    .eq("tenant_id", tenantId);

  // ── Trigger odoo-sync with bypass flag ─────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    const msg = "Missing Supabase runtime env for odoo-sync trigger";
    await service
      .from("order_drafts")
      .update({ sync_state: "sync_failed", last_sync_error: msg })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    return NextResponse.json(
      { sync_state: "sync_failed", sync_run_started: false, error: msg },
      { status: 200 },
    );
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/odoo-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        order_draft_id: id,
        tenant_id: tenantId,
        run_id: runId,
        bypass: true,
      }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!res.ok) {
      const body = await res.text();
      const msg = `odoo-sync ${res.status}: ${body}`.slice(0, 1000);
      await service
        .from("order_drafts")
        .update({ sync_state: "sync_failed", last_sync_error: msg })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      return NextResponse.json(
        { sync_state: "sync_failed", sync_run_started: true, error: msg },
        { status: 200 },
      );
    }

    const result = (await res.json().catch(() => null)) as {
      ok?: boolean;
      odoo_so_id?: number | null;
      odoo_so_name?: string | null;
    } | null;

    return NextResponse.json({
      sync_state: result?.ok === false ? "sync_failed" : "pending",
      sync_run_started: true,
      odoo_so_id: result?.odoo_so_id ?? null,
      odoo_so_name: result?.odoo_so_name ?? null,
    });
  } catch (e: unknown) {
    // Timeout — edge keeps running; UI polls sync_state.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[push] odoo-sync trigger error:", msg);
    return NextResponse.json({ sync_state: "pending", sync_run_started: true });
  }
}
