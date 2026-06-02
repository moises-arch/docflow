-- Email ingest sources gain a configurable list of allowed MIME types.
-- Default for NEW sources: PDF only (most providers send proper PDFs and the
-- rest is signature noise). Existing sources fall back to the legacy permissive
-- behavior when the field is null (backwards compat).
--
-- Stored in `settings` JSONB so we don't need a new column. Read pattern:
--   settings->'allowed_mime_types' as text[] (or null = legacy behavior)

-- Add a check constraint to inbound_email_attachments.state for the new
-- "filtered_mime_type" outcome (attachment was rejected by the source's
-- allowed list, NOT processed, NOT counted in cost).
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
    from pg_constraint
   where conrelid = 'inbound_email_attachments'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%state%'
   limit 1;
  if v_constraint_name is not null then
    execute format('alter table inbound_email_attachments drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table inbound_email_attachments
  add constraint inbound_email_attachments_state_check
  check (
    state in (
      'stored',
      'document_created',
      'unsupported',
      'skipped_inline',
      'filtered_mime_type',
      'failed'
    )
  );

comment on column email_ingest_sources.settings is
  'Adapter-specific config. Recognized keys: adapter, webhook_secret, allowed_mime_types (text[]), graph_*, imap_*';
