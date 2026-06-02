import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { secrets } from "../_shared/secrets.ts";

const DOCUMENTS_BUCKET = "documents";
// 5 min — antes 15. Para fotos del QR mobile la espera de 15 min era muy
// larga; 5 min cubre el peor caso normal de extracción Claude vision y
// libera al usuario rápido si la edge function murió.
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const SYNC_STUCK_TIMEOUT_MS = 5 * 60 * 1000;
const ORPHAN_CUTOFF_MS = 60 * 60 * 1000;
const LIST_PAGE_SIZE = 100;
const QUERY_BATCH_SIZE = 200;
const DELETE_BATCH_SIZE = 100;

type StorageObject = {
  id?: string | null;
  name: string;
  created_at?: string | null;
};

type ListedObject = {
  path: string;
  createdAt: string | null;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return atob(padded);
}

function authorizationRole(req: Request): string | null {
  const auth = req.headers.get("authorization");
  const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1];
  const payload = token?.split(".")[1];
  if (!payload) return null;

  try {
    const claims = JSON.parse(decodeBase64Url(payload)) as { role?: unknown };
    return typeof claims.role === "string" ? claims.role : null;
  } catch {
    return null;
  }
}

function chunk<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

async function listBucketObjects(
  supabase: ReturnType<typeof createServiceClient>,
  prefix = "",
): Promise<ListedObject[]> {
  const files: ListedObject[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`Failed to list storage objects for "${prefix}": ${error.message}`);
    }

    const objects = (data ?? []) as StorageObject[];
    for (const object of objects) {
      const path = prefix ? `${prefix}/${object.name}` : object.name;

      if (object.id == null) {
        files.push(...(await listBucketObjects(supabase, path)));
        continue;
      }

      files.push({ path, createdAt: object.created_at ?? null });
    }

    if (objects.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }

  return files;
}

async function loadDocumentStoragePaths(
  supabase: ReturnType<typeof createServiceClient>,
  paths: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();

  // 1. documents.storage_path — primary path for uploaded/processed files
  for (const batch of chunk(paths, QUERY_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("documents")
      .select("storage_path")
      .in("storage_path", batch);

    if (error) {
      throw new Error(`Failed to load document storage paths: ${error.message}`);
    }

    for (const row of data ?? []) {
      if (row.storage_path) existing.add(row.storage_path);
    }
  }

  // 2. inbound_emails — body files (raw.json, body.html, body.txt) live in
  // the same bucket but are NOT registered in documents. Without this check
  // the janitor deletes them and the email viewer drawer breaks.
  // Fetch ALL rows once instead of batching with OR (the table is small
  // relative to the bucket and OR with %L escaping is fragile).
  {
    const { data, error } = await supabase
      .from("inbound_emails")
      .select("raw_storage_path,html_storage_path,text_storage_path");

    if (error) {
      throw new Error(`Failed to load inbound_emails storage paths: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<{
      raw_storage_path: string | null;
      html_storage_path: string | null;
      text_storage_path: string | null;
    }>) {
      if (row.raw_storage_path) existing.add(row.raw_storage_path);
      if (row.html_storage_path) existing.add(row.html_storage_path);
      if (row.text_storage_path) existing.add(row.text_storage_path);
    }
  }

  // 3. inbound_email_attachments — attachment files
  for (const batch of chunk(paths, QUERY_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("inbound_email_attachments")
      .select("storage_path")
      .in("storage_path", batch);

    if (error) {
      throw new Error(`Failed to load attachment storage paths: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<{ storage_path: string | null }>) {
      if (row.storage_path) existing.add(row.storage_path);
    }
  }

  return existing;
}

async function deleteStoragePaths(
  supabase: ReturnType<typeof createServiceClient>,
  paths: string[],
): Promise<number> {
  let deletedCount = 0;

  for (const batch of chunk(paths, DELETE_BATCH_SIZE)) {
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(batch);

    if (error) {
      throw new Error(`Failed to delete orphaned storage objects: ${error.message}`);
    }

    deletedCount += data?.length ?? 0;
  }

  return deletedCount;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  if (authorizationRole(req) !== "service_role") {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    // Resolve required secrets explicitly so misconfiguration fails fast.
    secrets.supabaseUrl;
    secrets.supabaseServiceKey;

    const supabase = createServiceClient();
    const processingCutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS).toISOString();
    const orphanCutoff = Date.now() - ORPHAN_CUTOFF_MS;

    const { data: resetRows, error: resetError } = await supabase
      .from("documents")
      .update({
        state: "failed_processing",
        last_error: "Processing timed out after 15 minutes",
      })
      .eq("state", "processing")
      .lt("updated_at", processingCutoff)
      .select("id");

    if (resetError) {
      throw new Error(`Failed to reset timed-out documents: ${resetError.message}`);
    }

    // Reset order_drafts stuck in sync_state="in_progress".
    // Buffer over the retry-sync 3-minute threshold so user retries take precedence.
    const syncCutoff = new Date(Date.now() - SYNC_STUCK_TIMEOUT_MS).toISOString();
    const { data: stuckSyncRows, error: stuckSyncError } = await supabase
      .from("order_drafts")
      .update({
        sync_state: "sync_failed",
        last_sync_error: "Stuck in_progress; auto-failed by janitor",
      })
      .eq("sync_state", "in_progress")
      .lt("updated_at", syncCutoff)
      .select("id");

    if (stuckSyncError) {
      console.error("[janitor-uploads] stuck-sync cleanup failed:", stuckSyncError.message);
    }

    // Reintentar documentos atascados en "uploaded" (invokeIngest falló en el intento inicial).
    // Si llevan más de 5 min en "uploaded" sin pasar a "processing", algo falló.
    // Excluir packing slips (is_packing_slip:true) — son "reviewed" por diseño y no van a AI.
    const uploadedCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: uploadedDocs } = await supabase
      .from("documents")
      .select("id, tenant_id, source_meta")
      .eq("state", "uploaded")
      .lt("updated_at", uploadedCutoff)
      .limit(10);

    let retriedUploadedCount = 0;
    for (const doc of (uploadedDocs ?? []) as Array<{ id: string; tenant_id: string; source_meta: Record<string, unknown> | null }>) {
      // Skip packing slips — they don't go through AI pipeline
      if (doc.source_meta?.is_packing_slip === true) continue;
      try {
        const res = await fetch(`${secrets.supabaseUrl}/functions/v1/ingest`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secrets.supabaseServiceKey}`,
          },
          body: JSON.stringify({ document_id: doc.id, tenant_id: doc.tenant_id }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          retriedUploadedCount++;
        } else {
          const body = await res.text().catch(() => "");
          console.error(`[janitor-uploads] ingest retry failed for ${doc.id}: ${res.status} ${body.slice(0, 100)}`);
        }
      } catch (err) {
        console.error(`[janitor-uploads] ingest retry error for ${doc.id}:`, err instanceof Error ? err.message : err);
      }
    }

    const allObjects = await listBucketObjects(supabase);
    const candidatePaths = allObjects
      .filter((object) => {
        if (!object.createdAt) return false;
        const createdAtMs = Date.parse(object.createdAt);
        return Number.isFinite(createdAtMs) && createdAtMs < orphanCutoff;
      })
      .map((object) => object.path);

    const existingPaths =
      candidatePaths.length > 0
        ? await loadDocumentStoragePaths(supabase, candidatePaths)
        : new Set<string>();
    const orphanPaths = candidatePaths.filter((path) => !existingPaths.has(path));
    const deletedCount =
      orphanPaths.length > 0 ? await deleteStoragePaths(supabase, orphanPaths) : 0;

    return json({
      ok: true,
      reset_count: resetRows?.length ?? 0,
      sync_reset_count: stuckSyncRows?.length ?? 0,
      retried_uploaded_count: retriedUploadedCount,
      deleted_count: deletedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[janitor-uploads]", message);
    return json({ ok: false, error: message }, 500);
  }
});
