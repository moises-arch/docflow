-- Walmart per-tenant configuration. Separate table to avoid altering the
-- core `tenants` schema. One row per tenant.

create table walmart_tenant_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  ai_fallback_enabled boolean not null default false,
  auto_acknowledge boolean not null default true,
  webhook_subscription_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at_walmart_tenant_settings
  before update on walmart_tenant_settings
  for each row execute function set_updated_at();

alter table walmart_tenant_settings enable row level security;
create policy "walmart_tenant_settings: members read" on walmart_tenant_settings for select
  using (is_tenant_member(tenant_id));
create policy "walmart_tenant_settings: members all" on walmart_tenant_settings for all
  using (is_tenant_member(tenant_id))
  with check (is_tenant_member(tenant_id));
