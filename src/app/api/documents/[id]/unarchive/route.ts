// Revierte el estado de un documento archivado a 'needs_review'.
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { routing } from "@/i18n/routing";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members").select("tenant_id").eq("user_id", user.id).single();
  if (!membership?.tenant_id)
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });

  const { data: doc } = await supabase
    .from("documents").select("id, state").eq("id", id).eq("tenant_id", membership.tenant_id).single();
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  if (doc.state !== "archived") {
    return NextResponse.json({ ok: true, skipped: true, reason: "not_archived" });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("documents")
    .update({ state: "needs_review" })
    .eq("id", id)
    .eq("tenant_id", membership.tenant_id);

  if (error) return NextResponse.json({ error: "Failed to unarchive" }, { status: 500 });

  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/processed`);
    revalidatePath(`/${locale}/inbox`);
    revalidatePath(`/${locale}/dashboard`);
  }

  return NextResponse.json({ ok: true });
}
