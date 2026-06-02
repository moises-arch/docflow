# Architecture

## Purpose

Describe the system shape, runtime topology, and data flow for Phase 1. This file is the orientation a new engineer needs before reading any workflow or service spec.

## Responsibilities

- Name every runtime component.
- Show how a document travels from upload to ERP.
- Define trust and isolation boundaries.
- Pin runtime assumptions (where code runs, what timeouts exist, what shape events have).

## High-level diagram (text)

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                            Browser (Next.js)                        │
 │   Inbox · Review · Processed · Settings   — next-intl (en/es)       │
 └─────────────┬───────────────────────────────────────────────────┬──┘
               │ Supabase JS client                                │ server actions /
               │ (RLS-enforced reads)                              │ Route handlers
               ▼                                                   ▼
 ┌─────────────────────────────┐          ┌──────────────────────────────┐
 │   Supabase Auth + Postgres  │◀────────▶│   Next.js Server (Vercel)    │
 │   RLS · Storage · Realtime  │          │   Route handlers for mutations│
 └─────────────────────────────┘          └──────────────┬───────────────┘
       ▲             ▲                                   │
       │             │                                   ▼ invoke
       │             │                      ┌──────────────────────────┐
       │             │                      │  Supabase Edge Functions  │
       │             │                      │  • ingest                  │
       │             │                      │  • ai-process              │
       │             │                      │  • odoo-sync               │
       │             │                      └─────┬────────────┬───────┘
       │             │                            │            │
       │             │                            ▼            ▼
       │             │                   ┌─────────────┐  ┌──────────────┐
       │             └───────────────────│ Document AI │  │ Gemini       │
       │                                 │  (OCR)      │  │ (extraction) │
       │                                 └─────────────┘  └──────────────┘
       │                                            │
       │                                            ▼
       │                                  ┌──────────────────┐
       └──────────────────────────────────│  ERP 19         │
                                          │  (tenant's ERP)  │
                                          └──────────────────┘
```

## Components

### Frontend — Next.js App Router on Vercel

- Server Components for read-heavy pages; Client Components only where interaction requires it (review editor, upload dropzone).
- Route handlers for mutations that need server-side secrets or complex orchestration.
- Supabase JS client in Client Components for real-time subscriptions (Inbox updates).
- `next-intl` middleware resolves locale (`/en/*`, `/es/*`). No hardcoded strings — see [README.md](./README.md#internationalization).

### Auth — Supabase Auth

- Email/password for Phase 1 (magic links deferred).
- Sessions in cookies, read by Next.js server middleware.
- Tenant membership resolved from `tenant_members` table — see [tenancy-auth.md](./tenancy-auth.md).

### Data — Supabase Postgres

- Single shared Postgres database, tenant-isolated by **RLS**.
- JSONB for extraction payloads (schema-lite, versioned).
- See [data.md](./data.md) for tables and policies.

### Files — Supabase Storage

- One bucket, `documents`, private.
- Objects stored under `{tenant_id}/{document_id}/{filename}`.
- Signed URLs for browser access; service role for Edge Function reads.

### Processing — Supabase Edge Functions

Three functions form the engine:

| Function     | Trigger                                | Purpose                                                                               |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `ingest`     | Called by Next.js after upload         | Validate file, create `documents` row, enqueue `ai-process`                           |
| `ai-process` | Invoked by `ingest`; can be re-invoked | Orchestrates Document AI → classification → Gemini → normalization → credit deduction |
| `odoo-sync`  | Invoked on approval; can be retried    | Push approved draft to ERP 19                                                        |

All three are **Deno runtime**, under the Edge Functions 150s wall-clock limit. Long AI calls are chunked or offloaded where needed — see [workflows/ai-processing.md](./workflows/ai-processing.md).

### External services

- **Google Document AI** — OCR and page layout. See [services/ai-adapters.md](./services/ai-adapters.md).
- **Gemini** — structured field extraction from OCR'd text. Same spec.
- **ERP 19** — per-tenant ERP. JSON-RPC. See [services/odoo.md](./services/odoo.md).
- **Stripe** — **not wired yet.** Data shape only — see [credits.md](./credits.md).

## Data flow: a document's life

1. **Upload.** User drops a PDF in the Inbox. Next.js route handler validates, uploads to Storage, calls `ingest`.
2. **Ingest.** `ingest` creates a `documents` row (state: `uploaded`), creates empty `extractions` shell, invokes `ai-process` with `document_id`.
3. **Process.** `ai-process` transitions doc to `processing`, pulls PDF from Storage, calls Document AI for OCR+layout, classifies pages (relevant vs noise), sends relevant pages to Gemini with an extraction schema, normalizes output, writes `extractions` and `order_drafts`. Computes credits and writes `credit_ledger`. Transitions doc to `needs_review`.
4. **Review.** User opens Inbox, clicks doc, sees PDF + extracted fields side-by-side. Edits inline. Clicks **Approve**. Doc transitions to `reviewed`; Next.js invokes `odoo-sync`.
5. **Sync.** `odoo-sync` resolves customer + product mappings, creates Draft Sales Order in ERP via JSON-RPC. Records attempt in `odoo_sync_attempts`. On success, `order_drafts.odoo_so_id` is set and sync state is `synced`. On failure, attempt is recorded with error and retry is enabled.
6. **Done.** Doc appears in Processed screen. Failed sync appears with a fix path.

See each workflow spec for stage-by-stage detail.

## Runtime boundaries

### Trust boundaries

- **Browser** is untrusted. Never send anything to the browser that another tenant shouldn't see.
- **Next.js server (Vercel)** is trusted. Holds service-role Supabase key for privileged operations.
- **Edge Functions** are trusted. Hold secrets (Document AI key, Gemini key, ERP credentials resolved per tenant).
- **Per-tenant ERP credentials** are stored encrypted in `odoo_connections` — decrypted only at sync time in the Edge Function. See [tenancy-auth.md](./tenancy-auth.md).

### Isolation model

- RLS enforces tenant isolation at the database layer. A compromised Next.js server cannot leak tenant A's data to a tenant B user because the user's JWT carries their `tenant_id`.
- Service-role queries (Edge Functions) bypass RLS — they must include `tenant_id` in every `where` clause explicitly. Reviewed in code review as a hard rule.
- Storage paths embed `tenant_id` as the first path segment. Storage RLS policies deny cross-tenant access.

## Runtime assumptions

- **Edge Function wall-clock: 150s.** `ai-process` must finish within this. If a document is too large, we split at the page-classification stage and invoke follow-up runs. See [workflows/ai-processing.md](./workflows/ai-processing.md).
- **Document size cap: 25 MB.** Rejected at upload with a clear i18n error. Tunable per tenant later.
- **Concurrency.** Each document is processed by exactly one `ai-process` run at a time — enforced by a row-level advisory lock on `documents.id`.
- **At-least-once semantics.** All Edge Functions may be re-invoked; all side effects are idempotent (see [README.md](./README.md#idempotency)).

## Event shape (internal)

Every workflow emits events to a `workflow_events` table and to stdout (picked up by Supabase logs):

```jsonc
{
  "ts": "2026-04-16T12:34:56.789Z",
  "tenant_id": "uuid",
  "document_id": "uuid",       // nullable
  "run_id": "uuid",            // one per Edge Function invocation
  "stage": "ocr" | "classify" | "extract" | "normalize" | "sync" | ...,
  "outcome": "ok" | "retry" | "fail",
  "duration_ms": 1234,
  "error_code": "string?",     // when outcome != ok
  "meta": { /* stage-specific, no PII */ }
}
```

## Deployment

- **Vercel** hosts the Next.js app. One project. Preview deploys per PR.
- **Supabase** hosts Postgres, Auth, Storage, Edge Functions. One project for Phase 1. Backups daily.
- **Secrets**: Document AI + Gemini keys live in Supabase Edge Function secrets. ERP credentials are per-tenant in the database (encrypted with a KMS-backed key whose material lives in Edge Function secrets).
- **Environments**: `dev`, `staging`, `prod`. Each is a separate Supabase project + Vercel deployment.

## Success criteria

- A new engineer can read this file plus one workflow spec and ship a slice.
- Trust boundaries are explicit enough to pass a first-pass security review.
- Nothing in this file contradicts [data.md](./data.md), [tenancy-auth.md](./tenancy-auth.md), or any workflow spec.

## Dependencies

- Supabase project with Auth, Storage, Postgres, Edge Functions enabled.
- Google Cloud project with Document AI processor provisioned.
- Gemini API access.
- Per-tenant ERP 19 instance reachable over HTTPS.
