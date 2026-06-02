-- Fix: migration 20260508000003 was marked applied via `repair` without the
-- SQL actually running, so the check constraint on inbound_email_attachments
-- still only has 4 states. The email-pipeline code writes 'skipped_inline'
-- (was already used before) and 'filtered_mime_type' (new). Without these
-- states the constraint fires and the entire email is lost.
--
-- Drop + re-add so it's idempotent regardless of current constraint state.

alter table inbound_email_attachments
  drop constraint if exists inbound_email_attachments_state_check;

alter table inbound_email_attachments
  add constraint inbound_email_attachments_state_check
  check (state in (
    'stored',
    'document_created',
    'unsupported',
    'skipped_inline',
    'filtered_mime_type',
    'failed'
  ));
