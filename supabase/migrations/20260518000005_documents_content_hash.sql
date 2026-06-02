-- B16: Content hash for documents — enables extraction cache hits across
-- re-uploads of the same file. Anthropic calls are expensive; if a user (or
-- multiple email forwards) ingests the same exact PDF twice we shouldn't
-- pay the AI vendor twice.
--
-- The hash is computed at upload time in /api/upload/route.ts using SHA-256
-- over the raw bytes. NULL is allowed (legacy rows pre-this migration), so
-- the column is nullable. New rows will always populate it.

alter table documents
  add column if not exists content_hash text;

-- Per-tenant index — cache lookups are tenant-scoped (a tenant should never
-- reuse another tenant's extraction even if hashes collide by coincidence).
create index if not exists documents_tenant_content_hash_idx
  on documents (tenant_id, content_hash)
  where content_hash is not null;

comment on column documents.content_hash is
  'SHA-256 hex digest of the uploaded file bytes. Used by ai-process to skip Anthropic when a previous extraction for the same content exists in the same tenant.';
