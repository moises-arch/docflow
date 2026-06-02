// Returns a short-lived signed URL for the original document file.
// Token-scoped: only docs belonging to the token's tenant are visible.

import { NextRequest, NextResponse } from "next/server";
import { verifyScanToken } from "@/lib/scan-token";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const BUCKET = "documents";
const URL_TTL_SECONDS = 300; // 5 min — enough to open + view

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; documentId: string }> },
) {
  const { token, documentId } = await params;
  const payload = verifyScanToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: doc } = await service
    .from("documents")
    .select("id, storage_path, mime_type, original_name")
    .eq("id", documentId)
    .eq("tenant_id", payload.tenant_id)
    .maybeSingle();

  if (!doc || !(doc as { storage_path?: string }).storage_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storagePath = (doc as { storage_path: string }).storage_path;
  const { data: signed, error: signErr } = await service.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, URL_TTL_SECONDS);

  if (signErr || !signed) {
    return NextResponse.json({ error: "Failed to sign URL" }, { status: 500 });
  }

  return NextResponse.json({
    url: signed.signedUrl,
    mime_type: (doc as { mime_type: string | null }).mime_type,
    original_name: (doc as { original_name: string | null }).original_name,
    expires_in: URL_TTL_SECONDS,
  });
}
