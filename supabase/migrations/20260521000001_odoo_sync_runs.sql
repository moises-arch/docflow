-- odoo_sync_runs: histórico de sincronizaciones del cache Odoo (products/catalog/schema)
-- Sustrato para el timer/last-sync visible en el dialog del header.

create table odoo_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  scope text not null check (scope in ('products', 'catalog', 'schema')),
  trigger text not null check (trigger in ('cron', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  imported integer,
  deactivated integer,
  error text,
  created_at timestamptz not null default now()
);

create index odoo_sync_runs_tenant_scope_started_idx
  on odoo_sync_runs (tenant_id, scope, started_at desc);

create index odoo_sync_runs_in_progress_idx
  on odoo_sync_runs (tenant_id, finished_at)
  where finished_at is null;

alter table odoo_sync_runs enable row level security;

create policy "odoo_sync_runs: members read" on odoo_sync_runs
  for select using (
    tenant_id in (select tenant_id from tenant_members where user_id = auth.uid())
  );
