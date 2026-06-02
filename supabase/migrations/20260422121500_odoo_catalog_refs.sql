-- Odoo extended reference catalog for configurable exports (taxes, currencies, uom, etc.).

create table integration_catalog_refs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null check (provider in ('odoo')),
  catalog_type text not null check (catalog_type in (
    'currencies',
    'taxes',
    'uoms',
    'warehouses',
    'carriers',
    'payment_terms',
    'sales_teams'
  )),
  external_id text not null,
  code text,
  name text not null,
  active boolean not null default true,
  raw jsonb not null default '{}',
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, catalog_type, external_id)
);

create index integration_catalog_refs_lookup_idx
  on integration_catalog_refs (tenant_id, provider, catalog_type, name);

create trigger set_updated_at_integration_catalog_refs before update on integration_catalog_refs
  for each row execute function set_updated_at();

alter table integration_catalog_refs enable row level security;
create policy "integration_catalog_refs: members all" on integration_catalog_refs for all
  using (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_catalog_refs.tenant_id
      and tm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_catalog_refs.tenant_id
      and tm.user_id = auth.uid()
  ));
