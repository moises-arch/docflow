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
    .select("id, document_id, documents!inner(state)")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!draft) {
    return NextResponse.json({ error: "Order draft not found" }, { status: 404 });
  }

  const documentState = Array.isArray(draft.documents)
    ? draft.documents[0]?.state
    : draft.documents?.state;

  if (documentState !== "needs_review") {
    return NextResponse.json({ error: "Document is not reviewable" }, { status: 409 });
  }

  const service = createServiceClient();
  const rejectedAt = new Date().toISOString();

  const [docRes, draftRes] = await Promise.all([
    service
      .from("documents")
      .update({ state: "rejected", last_error: null })
      .eq("id", draft.document_id)
      .eq("tenant_id", tenantId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from("order_drafts")
      .update({ rejected_by: user.id, rejected_at: rejectedAt })
      .eq("id", id)
      .eq("tenant_id", tenantId),
  ]);

  if (docRes.error) {
    return NextResponse.json({ error: "Failed to reject document" }, { status: 500 });
  }
  if (draftRes.error) {
    console.error("[reject] failed to write audit columns:", draftRes.error.message);
  }

  return NextResponse.json({ ok: true });
}
