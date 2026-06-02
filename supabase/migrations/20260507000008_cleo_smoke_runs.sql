-- Tracks Cleo smoke test executions for trend monitoring on the dashboard.

create table cleo_smoke_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ok boolean not null,
  checks jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index cleo_smoke_runs_tenant_idx
  on cleo_smoke_runs (tenant_id, created_at desc);

alter table cleo_smoke_runs enable row level security;
create policy "cleo_smoke_runs: members read" on cleo_smoke_runs for select
  using (is_tenant_member(tenant_id));
create policy "cleo_smoke_runs: members insert" on cleo_smoke_runs for insert
  with check (is_tenant_member(tenant_id));
