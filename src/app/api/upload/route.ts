export const maxDuration = 60;
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkAndConsume, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;
const BUCKET = "documents";

function extensionForMime(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (mimeType === "application/vnd.ms-excel") return "xls";
  return "bin";
}

export async function POST(req: NextRequest) {
  // ── 1. Authenticate ────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr ?? !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parse multipart body ────────────────────────────────────────────────
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

  // ── 3. Validate ────────────────────────────────────────────────────────────
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

  // ── 4. Resolve tenant ──────────────────────────────────────────────────────
  // The user's tenant is resolved from the database; never trusted from client.
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const tenantId = membership.tenant_id;

  // Document kind from the manual upload type selector. "payment" routes to the
  // dedicated payment-process function; anything else keeps the standard order
  // pipeline (ingest → ai-process) untouched.
  const documentKind = formData.get("document_kind") === "payment" ? "payment" : "auto";

  // ── 4b. Rate limit: 100 uploads/h per tenant ───────────────────────────────
  const rl = await checkAndConsume({
    tenantId,
    key: "upload",
    capacity: 100,
    refillPerHour: 100,
  });
  const rlResp = rateLimitResponse(rl);
  if (rlResp) return rlResp;

  // ── 5. Check credits before accepting upload ───────────────────────────────
  const { data: creditBalance, error: creditErr } = await supabase
    .from("credit_balances")
    .select("balance")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (creditErr) {
    console.error("[upload] credit check failed:", creditErr.message);
    return NextResponse.json({ error: "Failed to validate credits" }, { status: 500 });
  }

  if ((creditBalance?.balance ?? 0) <= 0) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  // ── 6. Upload to Storage ───────────────────────────────────────────────────
  const service = createServiceClient();
  const fileId = randomUUID();
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const extension = extensionForMime(fileEntry.type);
  const storagePath = `${tenantId}/${ym}/${fileId}.${extension}`;

  // Compute SHA-256 of the file bytes once. We need the bytes for the storage
  // upload anyway, and ai-process uses the hash to skip re-extraction when the
  // same content was already processed (B16 — extraction cache).
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
    console.error("[upload] storage error:", storageErr.message);
    return NextResponse.json({ error: "Storage upload failed" }, { status: 500 });
  }

  // ── 7. Create documents row ────────────────────────────────────────────────
  const { data: doc, error: dbErr } = await service
    .from("documents")
    .insert({
      id: fileId,
      tenant_id: tenantId,
      uploaded_by: user.id,
      original_name: fileEntry.name,
      storage_path: storagePath,
      mime_type: fileEntry.type,
      size_bytes: fileEntry.size,
      state: "uploaded",
      content_hash: contentHash,
      ...(documentKind === "payment" ? { document_kind: "payment" } : {}),
    })
    .select("id")
    .single();

  if (dbErr ?? !doc) {
    console.error("[upload] db insert error:", dbErr?.message);
    // Best-effort cleanup
    void service.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: "Failed to record document" }, { status: 500 });
  }

  // ── 8. Trigger ingest Edge Function (fire and forget) ────────────────────
  // We do NOT await the full ingest → ai-process chain. That chain can take
  // 30-90 seconds for large images or slow AI responses, which would cause
  // the upload request to timeout and show "Upload failed" even though the
  // file was stored successfully. Instead we return 201 immediately and let
  // processing complete in the background. The document state will update
  // in the inbox (uploaded → processing → needs_review / failed_processing).
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    // Payments use the dedicated extractor; everything else the order pipeline.
    const fnName = documentKind === "payment" ? "payment-process" : "ingest";
    const fnUrl = `${supabaseUrl}/functions/v1/${fnName}`;
    fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ document_id: doc.id, tenant_id: tenantId }),
      // 10s is plenty to ACCEPT the request; the ingest function returns
      // immediately after queuing work. If Supabase Functions is slow to
      // accept, we abort the fetch — the janitor will pick up the doc
      // (state stays `uploaded`) instead of leaving a connection dangling.
      signal: AbortSignal.timeout(10_000),
    }).catch((e: unknown) => {
      console.error("[upload] ingest trigger failed:", e);
    });
  } else {
    console.error("[upload] ingest trigger env missing — document will stay in 'uploaded' state");
  }

  return NextResponse.json({ documentId: doc.id }, { status: 201 });
}
