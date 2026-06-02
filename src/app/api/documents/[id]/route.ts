import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id)
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });

  const tenantId = membership.tenant_id;
  const service = createServiceClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, state, storage_path")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  // Delete document row (FK cascades remove all dependent rows).
  const { error: deleteErr } = await service
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (deleteErr) {
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }

  // Best-effort storage cleanup
  if (doc.storage_path) {
    void service.storage.from("documents").remove([doc.storage_path]);
  }

  return NextResponse.json({ ok: true });
}
