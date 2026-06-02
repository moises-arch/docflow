-- Multi-ERP integration foundations + Odoo 19 admin catalog/profile data.

create table integration_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null check (provider in ('odoo')),
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);
create index integration_connections_tenant_provider_idx
  on integration_connections (tenant_id, provider, status);

create table integration_models (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null check (provider in ('odoo')),
  model_name text not null,
  model_label text,
  transient boolean not null default false,
  abstract boolean not null default false,
  manual boolean not null default false,
  meta jsonb not null default '{}',
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, model_name)
);
create index integration_models_lookup_idx
  on integration_models (tenant_id, provider, model_name);

create table integration_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null check (provider in ('odoo')),
  model_name text not null,
  field_name text not null,
  field_label text,
  field_type text not null,
  relation_model text,
  required boolean not null default false,
  readonly boolean not null default false,
  stored boolean not null default true,
  selectable boolean not null default false,
  writeable boolean not null default true,
  meta jsonb not null default '{}',
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, model_name, field_name)
);
create index integration_fields_lookup_idx
  on integration_fields (tenant_id, provider, model_name, field_name);
create index integration_fields_writeable_idx
  on integration_fields (tenant_id, provider, model_name, writeable);

create table integration_catalog_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null check (provider in ('odoo')),
  external_id text not null,
  code text,
  barcode text,
  name text not null,
  uom text,
  active boolean not null default true,
  raw jsonb not null default '{}',
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, external_id)
);
create index integration_catalog_products_search_idx
  on integration_catalog_products (tenant_id, provider, code, name);

create table integration_catalog_partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null check (provider in ('odoo')),
  external_id text not null,
  name text not null,
  vat text,
  email text,
  phone text,
  city text,
  country text,
  active boolean not null default true,
  raw jsonb not null default '{}',
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, external_id)
);
create index integration_catalog_partners_search_idx
  on integration_catalog_partners (tenant_id, provider, name, vat);

create table export_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null check (provider in ('odoo')),
  name text not null,
  flow text not null check (flow in ('sales_order', 'purchase_order', 'invoice', 'shipping', 'custom')),
  root_model text not null,
  line_model text,
  active boolean not null default true,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index export_profiles_tenant_provider_idx
  on export_profiles (tenant_id, provider, flow, active);

create table export_profile_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  export_profile_id uuid not null references export_profiles(id) on delete cascade,
  scope text not null check (scope in ('header', 'line')),
  source_path text not null,
  destination_model text not null,
  destination_field text not null,
  required boolean not null default false,
  default_value jsonb,
  transform jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index export_profile_mappings_profile_idx
  on export_profile_mappings (export_profile_id, scope, active);

create table export_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null check (provider in ('odoo')),
  export_profile_id uuid references export_profiles(id) on delete set null,
  order_draft_id uuid references order_drafts(id) on delete set null,
  run_key uuid not null default gen_random_uuid(),
  status text not null check (status in ('queued', 'success', 'error')),
  external_id text,
  external_name text,
  request_meta jsonb not null default '{}',
  response_meta jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now()
);
create index export_runs_tenant_provider_idx
  on export_runs (tenant_id, provider, created_at desc);
create index export_runs_profile_idx
  on export_runs (export_profile_id, created_at desc);

create trigger set_updated_at_integration_connections before update on integration_connections
  for each row execute function set_updated_at();
create trigger set_updated_at_integration_models before update on integration_models
  for each row execute function set_updated_at();
create trigger set_updated_at_integration_fields before update on integration_fields
  for each row execute function set_updated_at();
create trigger set_updated_at_integration_catalog_products before update on integration_catalog_products
  for each row execute function set_updated_at();
create trigger set_updated_at_integration_catalog_partners before update on integration_catalog_partners
  for each row execute function set_updated_at();
create trigger set_updated_at_export_profiles before update on export_profiles
  for each row execute function set_updated_at();
create trigger set_updated_at_export_profile_mappings before update on export_profile_mappings
  for each row execute function set_updated_at();

alter table integration_connections enable row level security;
create policy "integration_connections: members all" on integration_connections for all
  using (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_connections.tenant_id
      and tm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_connections.tenant_id
      and tm.user_id = auth.uid()
  ));

alter table integration_models enable row level security;
create policy "integration_models: members all" on integration_models for all
  using (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_models.tenant_id
      and tm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_models.tenant_id
      and tm.user_id = auth.uid()
  ));

alter table integration_fields enable row level security;
create policy "integration_fields: members all" on integration_fields for all
  using (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_fields.tenant_id
      and tm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_fields.tenant_id
      and tm.user_id = auth.uid()
  ));

alter table integration_catalog_products enable row level security;
create policy "integration_catalog_products: members all" on integration_catalog_products for all
  using (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_catalog_products.tenant_id
      and tm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_catalog_products.tenant_id
      and tm.user_id = auth.uid()
  ));

alter table integration_catalog_partners enable row level security;
create policy "integration_catalog_partners: members all" on integration_catalog_partners for all
  using (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_catalog_partners.tenant_id
      and tm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = integration_catalog_partners.tenant_id
      and tm.user_id = auth.uid()
  ));

alter table export_profiles enable row level security;
create policy "export_profiles: members all" on export_profiles for all
  using (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = export_profiles.tenant_id
      and tm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = export_profiles.tenant_id
      and tm.user_id = auth.uid()
  ));

alter table export_profile_mappings enable row level security;
create policy "export_profile_mappings: members all" on export_profile_mappings for all
  using (exists (
    select 1
    from export_profiles ep
    join tenant_members tm on tm.tenant_id = ep.tenant_id
    where ep.id = export_profile_mappings.export_profile_id
      and tm.user_id = auth.uid()
  ))
  with check (exists (
    select 1
    from export_profiles ep
    join tenant_members tm on tm.tenant_id = ep.tenant_id
    where ep.id = export_profile_mappings.export_profile_id
      and tm.user_id = auth.uid()
  ));

alter table export_runs enable row level security;
create policy "export_runs: members all" on export_runs for all
  using (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = export_runs.tenant_id
      and tm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from tenant_members tm
    where tm.tenant_id = export_runs.tenant_id
      and tm.user_id = auth.uid()
  ));
