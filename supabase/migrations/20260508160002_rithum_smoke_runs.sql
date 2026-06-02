-- Tracks Rithum smoke test executions for trend monitoring on the dashboard.
-- Mirror of cleo_smoke_runs.

create table rithum_smoke_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ok boolean not null,
  checks jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index rithum_smoke_runs_tenant_idx
  on rithum_smoke_runs (tenant_id, created_at desc);

alter table rithum_smoke_runs enable row level security;
create policy "rithum_smoke_runs: members read" on rithum_smoke_runs for select
  using (is_tenant_member(tenant_id));
create policy "rithum_smoke_runs: members insert" on rithum_smoke_runs for insert
  with check (is_tenant_member(tenant_id));
