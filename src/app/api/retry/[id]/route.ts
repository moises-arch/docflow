export const maxDuration = 60;
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { applyParsedToDraft } from "@/lib/cleo/apply-parsed";
import type { CleoParsed } from "@/lib/cleo/parse-html";
import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // ── Authenticate ────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Verify tenant membership ────────────────────────────────────────────────
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const tenantId = membership.tenant_id;

  // ── Verify document belongs to tenant and is retryable ────────────────────
  const { data: doc } = await supabase
    .from("documents")
    .select("id, state, tenant_id, last_error, source_channel, source_meta, provider_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Allow retry of failed docs AND re-scan of needs_review docs.
  // Re-scan from inbox lets the user re-process a document that already went
  // through AI extraction (e.g., after fixing a provider template or product
  // mapping). The same code path works: reset to 'uploaded' and re-trigger
  // ingest. For Cleo docs, the post-processing also re-applies parsed_payload.
  if (doc.state !== "failed_processing" && doc.state !== "needs_review") {
    return NextResponse.json({ error: "Document is not in a retryable state" }, { status: 409 });
  }

  const service = createServiceClient();
  const runId = crypto.randomUUID();

  // ── Retry Odoo sync failures directly (no re-ingest) ──────────────────────
  const { data: draft } = await supabase
    .from("order_drafts")
    .select("id, sync_state")
    .eq("document_id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const shouldRetrySync =
    !!draft &&
    draft.sync_state === "sync_failed" &&
    typeof doc.last_error === "string" &&
    doc.last_error.startsWith("odoo_sync_");

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Retry trigger misconfigured" }, { status: 500 });
  }

  if (shouldRetrySync) {
    const { error: draftUpdateErr } = await service
      .from("order_drafts")
      .update({ sync_state: "pending", last_sync_error: null })
      .eq("id", draft.id)
      .eq("tenant_id", tenantId);

    if (draftUpdateErr) {
      return NextResponse.json({ error: "Failed to queue sync retry" }, { status: 500 });
    }

    const { error: docUpdateErr } = await service
      .from("documents")
      .update({ state: "reviewed", last_error: null })
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (docUpdateErr) {
      return NextResponse.json(
        { error: "Failed to reset document for sync retry" },
        { status: 500 },
      );
    }

    fetch(`${supabaseUrl}/functions/v1/odoo-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ order_draft_id: draft.id, tenant_id: tenantId, run_id: runId }),
    }).catch((e: unknown) => {
      console.error("[retry] odoo-sync trigger failed:", e);
    });

    return NextResponse.json({ ok: true, retry_type: "odoo_sync" });
  }

  // ── Reset state to 'uploaded' and re-trigger ingest ───────────────────────
  const { error: updateErr } = await service
    .from("documents")
    .update({ state: "uploaded", last_error: null })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: "Failed to reset document" }, { status: 500 });
  }

  // ── Cleo-source detection ────────────────────────────────────────────────
  const sourceMeta = (doc as unknown as { source_meta?: Record<string, unknown> }).source_meta;
  const isCleoDoc =
    sourceMeta && typeof sourceMeta === "object" && sourceMeta.source === "cleo";

  // For non-Cleo docs: trigger ingest async (fast response, document goes
  // through normal AI pipeline).
  const fnUrl = `${supabaseUrl}/functions/v1/ingest`;
  if (!isCleoDoc) {
    fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ document_id: id, tenant_id: tenantId }),
    }).catch((e: unknown) => {
      console.error("[retry] ingest trigger failed:", e);
    });
    return NextResponse.json({ ok: true });
  }

  // Cleo-source: trigger ingest synchronously, then run applyParsedToDraft
  // so the line items + addresses come from cleo_orders.parsed_payload
  // (authoritative) instead of the AI's often-incomplete extraction.
  // Total wait ~5-25s — the user sees a loading indicator during retry.
  try {
    await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ document_id: id, tenant_id: tenantId }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    console.error("[retry] cleo ingest trigger failed:", e);
    // Continue anyway — the AI may still finish in the background.
  }

  let cleoApplied: { lines: number; unmatched: number } | null = null;
  try {
    const cleoMessageId = String(sourceMeta.cleo_message_id ?? "");
    if (cleoMessageId) {
      type CleoOrderRow = { parsed_payload: CleoParsed | null };
      const { data: cleoOrderRows } = await (
        (service as unknown as {
          from: (table: string) => {
            select: (cols: string) => {
              eq: (col: string, val: string) => {
                eq: (col: string, val: string) => {
                  limit: (n: number) => Promise<{ data: CleoOrderRow[] | null }>;
                };
              };
            };
          };
        }).from("cleo_orders") as unknown as {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              eq: (col: string, val: string) => {
                limit: (n: number) => Promise<{ data: CleoOrderRow[] | null }>;
              };
            };
          };
        }
      )
        .select("parsed_payload")
        .eq("tenant_id", tenantId)
        .eq("cleo_message_id", cleoMessageId)
        .limit(1);
      const parsed = (cleoOrderRows ?? [])[0]?.parsed_payload;
      if (parsed) {
        const providerId =
          (doc as unknown as { provider_id?: string | null }).provider_id ?? null;
        const result = await applyParsedToDraft(id, tenantId, providerId, parsed);
        cleoApplied = {
          lines: result.lines_inserted,
          unmatched: result.unmatched_skus.length,
        };
      }
    }
  } catch (e) {
    console.error("[retry] cleo apply-parsed failed:", e);
  }

  return NextResponse.json({ ok: true, cleo_applied: cleoApplied });
}
