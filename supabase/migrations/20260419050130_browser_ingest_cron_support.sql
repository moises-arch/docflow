alter table browser_ingest_connections
  add column created_by uuid references auth.users(id) on delete set null;

create index browser_ingest_connections_due_idx
  on browser_ingest_connections (tenant_id, schedule_enabled, status, last_run_at);
