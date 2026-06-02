-- Providers, provider-owned mappings, configurable Odoo target fields,
-- and email ingest foundations.

create table providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  code text not null,
  status text not null default 'active'
    check (status in ('active','paused','archived')),
  default_currency char(3),
  email_domains text[] not null default '{}',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create index providers_tenant_status_idx on providers (tenant_id, status, name);

create table provider_detection_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_id uuid not null references providers(id) on delete cascade,
  rule_type text not null check (
    rule_type in (
      'email_domain',
      'sender_email',
      'subject_contains',
      'filename_contains',
      'extracted_field',
      'keyword'
    )
  ),
  field_path text,
  pattern text not null,
  priority int not null default 100,
  confidence numeric(4,3) not null default 0.800,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index provider_detection_rules_lookup_idx
  on provider_detection_rules (tenant_id, active, rule_type, priority);
create index provider_detection_rules_provider_idx
  on provider_detection_rules (provider_id, active, priority);
create unique index provider_detection_rules_unique_idx
  on provider_detection_rules (provider_id, rule_type, coalesce(field_path, ''), pattern);

create table target_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null,
  label text not null,
  scope text not null check (scope in ('header','line','partner','shipping','billing')),
  odoo_model text not null,
  odoo_field text not null,
  value_type text not null default 'text'
    check (value_type in ('text','number','date','currency','boolean','json')),
  required boolean not null default false,
  active boolean not null default true,
  system boolean not null default false,
  sort_order int not null default 100,
  default_value jsonb,
  validation jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);
create index target_fields_tenant_scope_idx on target_fields (tenant_id, scope, active, sort_order);

insert into target_fields (
  tenant_id,
  key,
  label,
  scope,
  odoo_model,
  odoo_field,
  value_type,
  required,
  system,
  sort_order
)
select
  tenants.id,
  defaults.key,
  defaults.label,
  defaults.scope,
  defaults.odoo_model,
  defaults.odoo_field,
  defaults.value_type,
  defaults.required,
  true,
  defaults.sort_order
from tenants
cross join (
  values
    ('partner_id', 'Customer', 'header', 'sale.order', 'partner_id', 'number', true, 10),
    ('client_order_ref', 'PO Number', 'header', 'sale.order', 'client_order_ref', 'text', true, 20),
    ('date_order', 'Order Date', 'header', 'sale.order', 'date_order', 'date', false, 30),
    ('currency_id', 'Currency', 'header', 'sale.order', 'currency_id', 'currency', false, 40),
    ('note', 'Notes', 'header', 'sale.order', 'note', 'text', false, 50),
    ('product_id', 'Product', 'line', 'sale.order.line', 'product_id', 'number', true, 100),
    ('product_uom_qty', 'Quantity', 'line', 'sale.order.line', 'product_uom_qty', 'number', true, 110),
    ('price_unit', 'Unit Price', 'line', 'sale.order.line', 'price_unit', 'number', false, 120),
    ('name', 'Line Description', 'line', 'sale.order.line', 'name', 'text', true, 130),
    ('tax_id', 'Taxes', 'line', 'sale.order.line', 'tax_id', 'json', false, 140)
) as defaults(key, label, scope, odoo_model, odoo_field, value_type, required, sort_order)
on conflict (tenant_id, key) do nothing;

create table provider_field_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_id uuid not null references providers(id) on delete cascade,
  target_field_id uuid not null references target_fields(id) on delete cascade,
  source_field_key text not null,
  source_field_label text,
  required_override boolean,
  active boolean not null default true,
  transform jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, target_field_id)
);
create index provider_field_mappings_provider_idx
  on provider_field_mappings (provider_id, active);
create index provider_field_mappings_target_idx
  on provider_field_mappings (target_field_id);

create table odoo_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  odoo_product_id int not null,
  name text not null,
  default_code text,
  barcode text,
  uom_name text,
  sale_ok boolean not null default true,
  active boolean not null default true,
  raw jsonb not null default '{}',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, odoo_product_id)
);
create index odoo_products_tenant_code_idx
  on odoo_products (tenant_id, default_code)
  where default_code is not null;
create index odoo_products_tenant_name_idx on odoo_products (tenant_id, name);

create table provider_product_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_id uuid not null references providers(id) on delete cascade,
  source_sku text,
  source_company_sku text,
  source_description text,
  odoo_product_id int not null,
  odoo_product_name text not null,
  odoo_default_code text,
  default_uom text,
  default_tax_rate numeric(6,4),
  confidence numeric(4,3) not null default 1.000,
  source text not null default 'manual'
    check (source in ('manual','auto','imported','odoo_catalog')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    source_sku is not null
    or source_company_sku is not null
    or source_description is not null
  )
);
create unique index provider_product_mappings_provider_sku_idx
  on provider_product_mappings (provider_id, source_sku)
  where source_sku is not null;
create unique index provider_product_mappings_provider_company_sku_idx
  on provider_product_mappings (provider_id, source_company_sku)
  where source_company_sku is not null;
create index provider_product_mappings_provider_description_idx
  on provider_product_mappings (provider_id, source_description)
  where source_description is not null;
create index provider_product_mappings_odoo_product_idx
  on provider_product_mappings (tenant_id, odoo_product_id);

create table email_ingest_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_id uuid references providers(id) on delete set null,
  address text not null,
  status text not null default 'active'
    check (status in ('active','paused','archived')),
  allowed_senders text[] not null default '{}',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, address)
);
create index email_ingest_sources_tenant_status_idx
  on email_ingest_sources (tenant_id, status);

create table inbound_emails (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ingest_source_id uuid references email_ingest_sources(id) on delete set null,
  provider_id uuid references providers(id) on delete set null,
  message_id text not null,
  from_email text not null,
  from_name text,
  subject text,
  received_at timestamptz not null default now(),
  state text not null default 'received'
    check (state in ('received','parsed','processing','processed','failed','ignored')),
  raw_storage_path text,
  html_storage_path text,
  text_storage_path text,
  error_code text,
  error_message text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, message_id)
);
create index inbound_emails_tenant_state_idx on inbound_emails (tenant_id, state, received_at desc);
create index inbound_emails_provider_idx on inbound_emails (provider_id, received_at desc);

create table inbound_email_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  inbound_email_id uuid not null references inbound_emails(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  storage_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  disposition text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index inbound_email_attachments_email_idx
  on inbound_email_attachments (inbound_email_id);
create index inbound_email_attachments_document_idx
  on inbound_email_attachments (document_id)
  where document_id is not null;

alter table documents
  add column provider_id uuid references providers(id) on delete set null,
  add column source_channel text not null default 'upload'
    check (source_channel in ('upload','email','api')),
  add column source_ref text,
  add column source_meta jsonb not null default '{}';
create index documents_provider_idx on documents (tenant_id, provider_id, created_at desc);
create index documents_source_idx on documents (tenant_id, source_channel, created_at desc);

alter table order_drafts
  add column provider_id uuid references providers(id) on delete set null;
create index order_drafts_provider_idx on order_drafts (tenant_id, provider_id, created_at desc);

create trigger set_updated_at_providers before update on providers
  for each row execute function set_updated_at();
create trigger set_updated_at_provider_detection_rules before update on provider_detection_rules
  for each row execute function set_updated_at();
create trigger set_updated_at_target_fields before update on target_fields
  for each row execute function set_updated_at();
create trigger set_updated_at_provider_field_mappings before update on provider_field_mappings
  for each row execute function set_updated_at();
create trigger set_updated_at_odoo_products before update on odoo_products
  for each row execute function set_updated_at();
create trigger set_updated_at_provider_product_mappings before update on provider_product_mappings
  for each row execute function set_updated_at();
create trigger set_updated_at_email_ingest_sources before update on email_ingest_sources
  for each row execute function set_updated_at();
create trigger set_updated_at_inbound_emails before update on inbound_emails
  for each row execute function set_updated_at();

alter table providers enable row level security;
create policy "providers: members all" on providers for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

alter table provider_detection_rules enable row level security;
create policy "provider_detection_rules: members all" on provider_detection_rules for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

alter table target_fields enable row level security;
create policy "target_fields: members all" on target_fields for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

alter table provider_field_mappings enable row level security;
create policy "provider_field_mappings: members all" on provider_field_mappings for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

alter table odoo_products enable row level security;
create policy "odoo_products: members read" on odoo_products for select
  using (is_tenant_member(tenant_id));

alter table provider_product_mappings enable row level security;
create policy "provider_product_mappings: members all" on provider_product_mappings for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

alter table email_ingest_sources enable row level security;
create policy "email_ingest_sources: members all" on email_ingest_sources for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

alter table inbound_emails enable row level security;
create policy "inbound_emails: members read" on inbound_emails for select
  using (is_tenant_member(tenant_id));

alter table inbound_email_attachments enable row level security;
create policy "inbound_email_attachments: members read" on inbound_email_attachments for select
  using (is_tenant_member(tenant_id));
