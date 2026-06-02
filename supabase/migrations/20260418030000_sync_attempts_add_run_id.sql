-- Add run_id and odoo_so_name to odoo_sync_attempts to match the real sync function.
-- attempt_key was the old mock idempotency key; run_id replaces it for real syncs.
alter table odoo_sync_attempts
  add column if not exists run_id      uuid,
  add column if not exists odoo_so_name text;

-- Make attempt_key nullable so inserts from the new function (which don't set it) succeed.
alter table odoo_sync_attempts
  alter column attempt_key drop not null;
