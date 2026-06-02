# Workflow — Upload

## Purpose

Get a user-submitted PO from the browser into durable storage, create a `documents` row, and hand off to the AI pipeline.

## Responsibilities

- Accept files via the Inbox dropzone.
- Validate size, MIME, and page count pre-processing.
- Store the file in Supabase Storage under a tenant-scoped path.
- Create the `documents` row and enqueue the AI pipeline.
- Report progress to the UI via the `documents.state` column (realtime subscription).

This workflow owns the "upload" surface end-to-end. It does **not** do OCR or extraction — that's [workflows/ai-processing.md](./workflows/ai-processing.md).

## Inputs

From the browser:

- One or more `File` objects (PDF, PNG, JPG, TIFF).
- Active session cookie (resolves `tenant_id`, `user_id`).
- Optional `provider_id` when the user uploads into a provider-specific workflow.

From config:

- Max file size (default 25 MB).
- Allowed MIME types.

## Outputs

Per uploaded file:

- One `documents` row with `state = 'uploaded'` transitioning to `'processing'` on Edge Function pickup.
- One object in Storage at `documents/{tenant_id}/{document_id}/{filename}`.
- One invocation of the `ai-process` Edge Function.

## Flow

```
Browser (Inbox)
  │  selectFiles() or drop
  ▼
POST /api/upload   (Next.js route handler, server)
  │  auth + tenant check
  │  validate(file)
  │  storage.upload(tenant_id/new_uuid/filename)
  │  insert documents (state='uploaded', source_channel='upload', provider_id?)
  │  invoke edge('ingest', { document_id, tenant_id })
  ▼
Edge Function: ingest
  │  verify ownership
  │  set documents.state = 'processing', processing_run_id = uuid()
  │  invoke edge('ai-process', { document_id, run_id })
  ▼
Return { document_id } to browser
  │
  ▼
UI: add row to Inbox table (optimistic)
  │  subscribe to documents realtime updates
  ▼
As state advances, UI updates inline.
```

## Validation rules

Applied server-side in the route handler **before** upload to Storage:

| Check                   | Rule                                                                         | Error code                      |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------- |
| MIME type               | `application/pdf`, `image/png`, `image/jpeg`, `image/tiff`                   | `upload.error.unsupported_type` |
| File size               | `<= 25 MB` (configurable)                                                    | `upload.error.too_large`        |
| Empty file              | `size > 0`                                                                   | `upload.error.empty`            |
| Filename                | Sanitized to `[A-Za-z0-9_.-]+`; length ≤ 128 chars                           | `upload.error.bad_filename`     |
| Provider ID             | If provided, must belong to the tenant and be active                         | `upload.error.bad_provider`     |
| Tenant balance (future) | Not checked in Phase 1 (overdraft allowed — see [credits.md](../credits.md)) | —                               |

Page-count validation happens **after** OCR (not here) because we don't want to parse PDFs in the route handler.

Virus scanning is out of scope for Phase 1. A hook is reserved: if `INTAKE_VIRUSSCAN_URL` is set, the route handler posts the file there and aborts on positive.

## Data structures

### Route handler request

```ts
// POST /api/upload  (multipart/form-data)
{
  files: File[],   // up to 10 per request
  provider_id?: string
}
```

### Route handler response

```ts
{
  uploaded: Array<{ document_id: string; original_name: string }>,
  rejected: Array<{ original_name: string; error_code: string }>
}
```

Partial success is explicit — 7 accepted, 3 rejected is a valid response, not an error.

### Edge Function `ingest` payload

```ts
{
  document_id: string,
  tenant_id: string,
  user_id: string,
  provider_id?: string
}
```

## States

Document lifecycle touched here: see [data.md](../data.md#document-lifecycle-documentsstate).

- On successful route-handler write: `uploaded`.
- On `ingest` pickup: `processing`.
- On `ingest` failure (e.g. Storage unreadable): `failed_processing` with `last_error = 'ingest_failed'`.

## Business rules

1. **One Storage object per document.** The path includes the `document_id` (uuid) — no collisions, no overwrites.
2. **Atomicity.** If Storage upload succeeds but `documents` insert fails, we delete the Storage object before returning an error. This is a best-effort compensating action; the janitor (below) catches leftovers.
3. **Progress pushback.** The UI subscribes to `documents` realtime updates for the affected rows; the route handler does not poll.
4. **Optimistic UI.** The Inbox row is added client-side as `uploading` then reconciles to the server-returned `document_id`. If the server rejects, the row is replaced with an error state.
5. **Multi-file uploads run in parallel** in the route handler with a bounded concurrency of 3 per request. Each file is its own Storage + DB transaction.
6. **Provider is optional.** Upload may supply `provider_id`, but unknown-provider documents still process and can be assigned in Review.

## Edge cases

- **Duplicate upload (same bytes, same tenant).** Not deduplicated in Phase 1 — each upload creates a new document. A dedup pass (`sha256(file)` column on `documents`) is a future optimization.
- **Wrong provider selected.** Operator can change provider in Review. Mapping resolution can re-run without re-OCR.
- **Upload interrupted mid-transfer.** The route handler's multipart parser fails; no Storage object or DB row is created.
- **Storage bucket missing or misconfigured.** Route handler returns 500 with `upload.error.storage_unavailable`. Admin is alerted (post-Phase-1 alerting, for now just logged loudly).
- **`ingest` Edge Function fails to invoke** (e.g. network blip). `documents` is left in `uploaded`. A **janitor job** runs hourly: for rows in `uploaded` > 10 minutes old, it retries `ingest` invocation.
- **User navigates away during upload.** The upload continues server-side; the row is visible when they return.

## Failure scenarios

| Scenario                                                      | Handling                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Route handler crashes after Storage upload                    | Compensating delete; if it also fails, janitor (below) cleans orphan.                   |
| `ingest` Edge Function throws                                 | Doc stays `uploaded`; janitor retries hourly (up to 3 times); then `failed_processing`. |
| User's tenant membership revoked between page load and upload | Route handler rejects with 403; browser shows auth-error state.                         |
| Storage over-quota (tenant or project)                        | Reject with `upload.error.storage_quota`; no doc row created.                           |

### Janitor job

A cron-scheduled Edge Function (`janitor-uploads`, hourly):

- **Orphan Storage objects**: objects > 24h old with no matching `documents` row → delete.
- **Stuck `uploaded` documents**: rows > 10m old in `uploaded` state → re-invoke `ingest` (up to 3 retries, tracked via `processing_run_id` history).
- **Stale `processing` documents**: rows > 20m in `processing` with no workflow events in the last 10m → transition to `failed_processing`.

## Success criteria

- 99.9% of valid uploads result in a `documents` row and a running `ai-process` within 5 seconds.
- No orphan Storage objects older than 24h in a healthy system.
- No `uploaded`-state rows older than 1h (janitor catches stuck ones).
- Rejected files (bad MIME, too large) never create a Storage object or DB row.
- Multi-file upload of 10 files completes within 15s on a typical connection.

## Dependencies

- [data.md](../data.md) — `documents` table, state enum, storage path convention.
- [tenancy-auth.md](../tenancy-auth.md) — session + tenant resolution in the route handler.
- [workflows/ai-processing.md](./ai-processing.md) — the downstream consumer.
- [ui.md](../ui.md) — Inbox screen hosts the dropzone.
- Supabase Storage bucket `documents` provisioned with tenant-scoped RLS.
