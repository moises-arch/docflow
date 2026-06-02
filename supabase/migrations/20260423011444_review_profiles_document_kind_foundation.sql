-- Review Profiles foundation: document-kind aware review templates.

create table if not exists review_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  document_kind text not null check (document_kind in ('purchase_order','invoice','shipping','receipt','custom')),
  description text,
  layout jsonb not null default '{}',
  active boolean not null default true,
  system boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists review_profiles_tenant_kind_idx
  on review_profiles (tenant_id, document_kind, active, sort_order);

alter table documents
  add column if not exists document_kind text
    check (document_kind in ('purchase_order','invoice','shipping','receipt','custom')),
  add column if not exists review_profile_id uuid references review_profiles(id) on delete set null;

alter table order_drafts
  add column if not exists document_kind text
    check (document_kind in ('purchase_order','invoice','shipping','receipt','custom')),
  add column if not exists review_profile_id uuid references review_profiles(id) on delete set null;

alter table target_fields
  add column if not exists review_profile_id uuid references review_profiles(id) on delete set null;

create index if not exists documents_tenant_kind_idx
  on documents (tenant_id, document_kind, created_at desc);

create index if not exists documents_review_profile_idx
  on documents (tenant_id, review_profile_id)
  where review_profile_id is not null;

create index if not exists order_drafts_tenant_kind_idx
  on order_drafts (tenant_id, document_kind, created_at desc);

create index if not exists order_drafts_review_profile_idx
  on order_drafts (tenant_id, review_profile_id)
  where review_profile_id is not null;

create index if not exists target_fields_review_profile_idx
  on target_fields (tenant_id, review_profile_id, active)
  where review_profile_id is not null;

insert into review_profiles (tenant_id, name, slug, document_kind, description, system, sort_order)
select
  t.id,
  v.name,
  v.slug,
  v.document_kind,
  v.description,
  true,
  v.sort_order
from tenants t
cross join (
  values
    ('Purchase Orders', 'purchase-orders', 'purchase_order', 'Review profile for purchase orders.', 10),
    ('Invoices', 'invoices', 'invoice', 'Review profile for invoices and bills.', 20),
    ('Shipping Documents', 'shipping-docs', 'shipping', 'Review profile for delivery/shipping documents.', 30),
    ('Receipts', 'receipts', 'receipt', 'Review profile for receipts.', 40),
    ('Custom Documents', 'custom-docs', 'custom', 'Custom review profile for non-standard documents.', 90)
) as v(name, slug, document_kind, description, sort_order)
on conflict (tenant_id, slug) do update
set
  name = excluded.name,
  document_kind = excluded.document_kind,
  description = excluded.description,
  active = true;

update target_fields tf
set review_profile_id = rp.id
from review_profiles rp
where tf.tenant_id = rp.tenant_id
  and rp.document_kind = 'purchase_order'
  and rp.slug = 'purchase-orders'
  and tf.review_profile_id is null;

update documents d
set
  document_kind = coalesce(d.document_kind, 'purchase_order'),
  review_profile_id = coalesce(d.review_profile_id, rp.id)
from review_profiles rp
where d.tenant_id = rp.tenant_id
  and rp.document_kind = 'purchase_order'
  and rp.slug = 'purchase-orders';

update order_drafts od
set
  document_kind = coalesce(od.document_kind, 'purchase_order'),
  review_profile_id = coalesce(od.review_profile_id, rp.id)
from review_profiles rp
where od.tenant_id = rp.tenant_id
  and rp.document_kind = 'purchase_order'
  and rp.slug = 'purchase-orders';

create trigger set_updated_at_review_profiles before update on review_profiles
  for each row execute function set_updated_at();

alter table review_profiles enable row level security;
create policy "review_profiles: members all" on review_profiles for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));
