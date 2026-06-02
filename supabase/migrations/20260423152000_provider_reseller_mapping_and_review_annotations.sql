create table if not exists provider_reseller_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_id uuid not null references providers(id) on delete cascade,
  odoo_partner_id integer not null,
  odoo_partner_name text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_id)
);

create index if not exists provider_reseller_mappings_tenant_partner_idx
  on provider_reseller_mappings (tenant_id, odoo_partner_id);

create trigger set_updated_at_provider_reseller_mappings before update on provider_reseller_mappings
  for each row execute function set_updated_at();

alter table provider_reseller_mappings enable row level security;

create policy "provider_reseller_mappings: members all" on provider_reseller_mappings for all
  using (
    exists (
      select 1 from tenant_members tm
      where tm.tenant_id = provider_reseller_mappings.tenant_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from tenant_members tm
      where tm.tenant_id = provider_reseller_mappings.tenant_id
        and tm.user_id = auth.uid()
    )
  );

create table if not exists provider_field_annotations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_id uuid not null references providers(id) on delete cascade,
  target_field_key text not null,
  source_hint text,
  normalized_text text,
  selection_meta jsonb not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_id, target_field_key)
);

create trigger set_updated_at_provider_field_annotations before update on provider_field_annotations
  for each row execute function set_updated_at();

alter table provider_field_annotations enable row level security;

create policy "provider_field_annotations: members all" on provider_field_annotations for all
  using (
    exists (
      select 1 from tenant_members tm
      where tm.tenant_id = provider_field_annotations.tenant_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from tenant_members tm
      where tm.tenant_id = provider_field_annotations.tenant_id
        and tm.user_id = auth.uid()
    )
  );

alter table odoo_connections
  drop column if exists reseller_name_default;
