-- Polish: odoo_sync_runs — add updated_at, trigger, comment, align RLS with is_tenant_member()

-- Add updated_at column after created_at
alter table odoo_sync_runs
add column updated_at timestamptz not null default now();

-- Create trigger to auto-update updated_at on modification
create trigger set_updated_at_odoo_sync_runs
before update on odoo_sync_runs
for each row execute function set_updated_at();

-- Add table comment explaining purpose
comment on table odoo_sync_runs is
  'Audit trail of Odoo cache syncs (products, catalog, schema). Substrate for the last-sync timer/countdown in the header sync dialog.';

-- Replace the policy with is_tenant_member() helper for consistency
drop policy "odoo_sync_runs: members read" on odoo_sync_runs;

create policy "odoo_sync_runs: members read" on odoo_sync_runs
  for select using (is_tenant_member(tenant_id));
