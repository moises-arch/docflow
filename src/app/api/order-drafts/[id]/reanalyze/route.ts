export const maxDuration = 60;
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
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

  const { data: draft } = await supabase
    .from("order_drafts")
    .select("id, document_id, meta")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!draft?.document_id) {
    return NextResponse.json({ error: "Order draft not found" }, { status: 404 });
  }

  const { data: document } = await supabase
    .from("documents")
    .select("id, state")
    .eq("id", draft.document_id)
    .eq("tenant_id", tenantId)
    .single();

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (document.state === "processing") {
    return NextResponse.json({ error: "Document is already processing" }, { status: 409 });
  }

  const service = createServiceClient();
  const runId = crypto.randomUUID();

  const { error: updateError } = await service
    .from("documents")
    .update({
      state: "processing",
      processing_run_id: runId,
      last_error: null,
    })
    .eq("id", draft.document_id)
    .eq("tenant_id", tenantId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to queue re-analysis" }, { status: 500 });
  }

  // Clear cleo_authoritative so ai-process updates draft lines with the new extraction.
  // Without this, ai-process silently skips the draft update for Cleo-sourced documents.
  if (draft.meta && typeof draft.meta === "object" && (draft.meta as Record<string, unknown>).cleo_authoritative === true) {
    const updatedMeta = { ...(draft.meta as Record<string, unknown>), cleo_authoritative: false };
    await service
      .from("order_drafts")
      .update({ meta: updatedMeta })
      .eq("id", draft.id)
      .eq("tenant_id", tenantId);
  }

  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-process`;
  void fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      document_id: draft.document_id,
      tenant_id: tenantId,
      run_id: runId,
    }),
  }).catch((error: unknown) => {
    console.error("[reanalyze] ai-process trigger failed:", error);
  });

  return NextResponse.json({ ok: true, run_id: runId });
}
