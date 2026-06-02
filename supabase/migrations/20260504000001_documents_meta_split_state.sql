-- Add meta JSONB column for split tracking and other document metadata
alter table documents add column if not exists meta jsonb;

-- Add doc_number: short human-readable identifier derived from id (first 8 hex chars uppercased).
-- Stored as generated column so it's always consistent and indexed.
alter table documents add column if not exists doc_number text
  generated always as (upper(substring(id::text, 1, 8))) stored;

create index if not exists documents_doc_number_idx on documents (tenant_id, doc_number);

-- Expand state check constraint to include 'split'
-- Drop old constraint and recreate with the new value.
alter table documents drop constraint if exists documents_state_check;
alter table documents add constraint documents_state_check check (
  state in (
    'uploaded', 'processing', 'needs_review',
    'reviewed', 'failed_processing', 'rejected', 'archived',
    'split'
  )
);
