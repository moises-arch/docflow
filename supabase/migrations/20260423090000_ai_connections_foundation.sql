-- AI provider connection per tenant (Anthropic/Gemini) with encrypted API keys.

create table ai_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'anthropic')),
  primary_model text not null,
  fallback_model text,
  api_key_enc text not null,
  instructions text,
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  settings jsonb not null default '{}',
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_connections_tenant_provider_idx
  on ai_connections (tenant_id, provider, status);

create trigger set_updated_at_ai_connections before update on ai_connections
  for each row execute function set_updated_at();

alter table ai_connections enable row level security;
create policy "ai_connections: members all" on ai_connections for all
  using (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = ai_connections.tenant_id
      and tm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = ai_connections.tenant_id
      and tm.user_id = auth.uid()
  ));
