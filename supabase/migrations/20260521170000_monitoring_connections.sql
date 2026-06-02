-- UptimeRobot monitoring connection per tenant with encrypted API key.

create table monitoring_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  provider text not null default 'uptimerobot' check (provider in ('uptimerobot')),
  api_key_enc text not null,
  account_email text,
  status text not null default 'active' check (status in ('active', 'error')),
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at_monitoring_connections before update on monitoring_connections
  for each row execute function set_updated_at();

alter table monitoring_connections enable row level security;
create policy "monitoring_connections: members all" on monitoring_connections for all
  using (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = monitoring_connections.tenant_id
      and tm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = monitoring_connections.tenant_id
      and tm.user_id = auth.uid()
  ));
