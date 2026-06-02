import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, original_name, mime_type")
    .eq("id", id)
    .eq("tenant_id", membership.tenant_id)
    .single();

  if (!doc?.storage_path)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, SIGNED_URL_EXPIRY_SECONDS, {
      download: false,
    });

  if (error || !signed?.signedUrl)
    return NextResponse.json({ error: "Could not generate file URL" }, { status: 500 });

  // ?view=1 → return JSON so the client can embed the URL directly
  if (_req.nextUrl.searchParams.get("view") === "1") {
    return NextResponse.json({
      url: signed.signedUrl,
      mimeType: doc.mime_type ?? "application/octet-stream",
      name: doc.original_name,
    });
  }

  return NextResponse.redirect(signed.signedUrl);
}
