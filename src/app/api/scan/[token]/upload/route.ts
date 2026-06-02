export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyScanToken } from "@/lib/scan-token";
import { checkAndConsume, rateLimitResponse } from "@/lib/rate-limit";

/**
 * POST /api/scan/[token]/upload
 *
 * Public upload endpoint protected by a signed token (no session required).
 * Token must have been minted by an authenticated tenant member via
 * /api/scan-links. The token's tenant_id and user_id are used to attribute
 * the document; everything else mirrors /api/upload.
 */
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;
const BUCKET = "documents";

function extensionForMime(mime: string) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (mime === "application/vnd.ms-excel") return "xls";
  return "bin";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  // 1. Verify token
  const { token } = await params;
  const payload = verifyScanToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
  }

  // 1b. Rate limit: same 100 uploads/h per tenant cap as /api/upload.
  // Prevents abuse if a scan token leaks — a malicious holder cannot
  // exhaust credits or storage indefinitely.
  const rl = await checkAndConsume({
    tenantId: payload.tenant_id,
    key: "scan-upload",
    capacity: 100,
    refillPerHour: 100,
  });
  const rlResp = rateLimitResponse(rl);
  if (rlResp) return rlResp;

  // 2. Parse multipart
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // 3. Validate
  if (!ALLOWED_MIME.includes(fileEntry.type as (typeof ALLOWED_MIME)[number])) {
    return NextResponse.json(
      { error: "Only PDF, JPG, PNG, or WEBP files are accepted" },
      { status: 422 },
    );
  }
  if (fileEntry.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds the 25 MB limit" }, { status: 422 });
  }
  if (fileEntry.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 422 });
  }

  const service = createServiceClient();

  // 4. Credit check (same policy as /api/upload)
  const { data: creditBalance } = await service
    .from("credit_balances")
    .select("balance")
    .eq("tenant_id", payload.tenant_id)
    .maybeSingle();
  if ((creditBalance?.balance ?? 0) <= 0) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  // 5. Upload to Storage
  const fileId = randomUUID();
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ext = extensionForMime(fileEntry.type);
  const storagePath = `${payload.tenant_id}/${ym}/${fileId}.${ext}`;

  // B16: SHA-256 hash for extraction cache.
  const fileBuffer = await fileEntry.arrayBuffer();
  const contentHash = await crypto.subtle
    .digest("SHA-256", fileBuffer)
    .then((buf) =>
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );

  const { error: storageErr } = await service.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: fileEntry.type,
      upsert: false,
    });
  if (storageErr) {
    console.error("[scan-upload] storage error:", storageErr.message);
    return NextResponse.json({ error: "Storage upload failed" }, { status: 500 });
  }

  // 6. Create documents row — tag as scanned for traceability
  const { data: doc, error: dbErr } = await service
    .from("documents")
    .insert({
      id: fileId,
      tenant_id: payload.tenant_id,
      uploaded_by: payload.user_id,
      original_name: fileEntry.name || `scan-${fileId}.${ext}`,
      storage_path: storagePath,
      mime_type: fileEntry.type,
      size_bytes: fileEntry.size,
      state: "uploaded",
      content_hash: contentHash,
      // source_channel queda en default ('upload') — la constraint solo permite
      // ('upload','email','api','browser'). La detección QR usa meta.source.
      meta: { source: "qr-scanner" },
    })
    .select("id")
    .single();

  if (dbErr ?? !doc) {
    console.error("[scan-upload] db insert error:", dbErr?.message);
    void service.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: "Failed to record document" }, { status: 500 });
  }

  // 7. Trigger ingest (fire & forget, same as /api/upload)
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceRoleKey) {
    fetch(`${supabaseUrl}/functions/v1/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ document_id: doc.id, tenant_id: payload.tenant_id }),
    }).catch((e: unknown) => console.error("[scan-upload] ingest trigger failed:", e));
  }

  return NextResponse.json({ documentId: doc.id }, { status: 201 });
}
