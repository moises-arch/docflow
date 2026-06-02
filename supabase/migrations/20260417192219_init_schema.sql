-- ============================================================
-- Intake — initial schema  (generated from spec/data.md)
-- Order: extensions → tables → triggers → helper functions → RLS → views
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- TRIGGER HELPER (no table deps)
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ============================================================
-- TABLES (in dependency order, no RLS yet)
-- ============================================================

-- 1. tenants
create table tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  locale     text not null default 'en',
  display_tz text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. tenant_members
create table tenant_members (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index on tenant_members (user_id);

-- 3. odoo_connections
create table odoo_connections (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null unique references tenants(id) on delete cascade,
  base_url        text not null,
  database        text not null,
  username        text not null,
  api_key_enc     bytea not null,
  status          text not null default 'unverified'
                  check (status in ('unverified','active','error')),
  last_checked_at timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 4. documents
create table documents (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  uploaded_by       uuid not null references auth.users(id),
  storage_path      text not null,
  original_name     text not null,
  mime_type         text not null,
  size_bytes        bigint not null,
  page_count        int,
  state             text not null default 'uploaded'
                    check (state in (
                      'uploaded','processing','needs_review',
                      'reviewed','failed_processing','rejected','archived'
                    )),
  last_error        text,
  processing_run_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on documents (tenant_id, state, created_at desc);
create index on documents (tenant_id, uploaded_by);

-- 5. document_pages
create table document_pages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  page_number int not null,
  page_type   text not null check (page_type in (
                'cover','body','line_items','signature','legal','blank','duplicate','other')),
  is_relevant boolean not null,
  confidence  numeric(4,3),
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  unique (document_id, page_number)
);
create index on document_pages (tenant_id, document_id);

-- 6. extractions
create table extractions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  document_id    uuid not null references documents(id) on delete cascade,
  run_id         uuid not null,
  schema_version int not null default 1,
  payload        jsonb not null,
  normalized     jsonb not null,
  model_meta     jsonb not null default '{}',
  confidence     numeric(4,3),
  current        boolean not null default true,
  created_at     timestamptz not null default now()
);
create unique index on extractions (document_id) where current = true;
create index on extractions (tenant_id, document_id, created_at desc);

-- 7. customer_mappings
create table customer_mappings (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  match_key         text not null,
  odoo_partner_id   int not null,
  odoo_partner_name text not null,
  confidence        numeric(4,3) not null default 1.0,
  source            text not null default 'manual'
                    check (source in ('manual','auto','imported')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, match_key)
);

-- 8. product_mappings
create table product_mappings (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  match_sku         text,
  match_description text,
  odoo_product_id   int not null,
  odoo_product_name text not null,
  default_uom       text,
  default_tax_rate  numeric(6,4),
  confidence        numeric(4,3) not null default 1.0,
  source            text not null default 'manual'
                    check (source in ('manual','auto','imported')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (match_sku is not null or match_description is not null)
);
create unique index on product_mappings (tenant_id, match_sku) where match_sku is not null;
create index on product_mappings (tenant_id, match_description) where match_description is not null;

-- 9. order_drafts
create table order_drafts (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  document_id         uuid not null unique references documents(id) on delete cascade,
  extraction_id       uuid not null references extractions(id),
  po_number           text,
  po_date             date,
  currency            char(3),
  buyer               jsonb not null default '{}',
  shipping_address    jsonb not null default '{}',
  billing_address     jsonb not null default '{}',
  notes               text,
  subtotal            numeric(18,4),
  tax_total           numeric(18,4),
  total               numeric(18,4),
  customer_mapping_id uuid references customer_mappings(id),
  sync_state          text not null default 'none'
                      check (sync_state in ('none','pending','in_progress','synced','sync_failed')),
  odoo_so_id          int,
  odoo_so_name        text,
  last_sync_error     text,
  approved_by         uuid references auth.users(id),
  approved_at         timestamptz,
  meta                jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on order_drafts (tenant_id, sync_state);
create index on order_drafts (tenant_id, approved_at desc);

-- 10. order_draft_lines
create table order_draft_lines (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  order_draft_id     uuid not null references order_drafts(id) on delete cascade,
  position           int not null,
  sku                text,
  description        text not null,
  quantity           numeric(18,4) not null,
  unit               text,
  unit_price         numeric(18,4),
  line_total         numeric(18,4),
  tax_rate           numeric(6,4),
  product_mapping_id uuid references product_mappings(id),
  odoo_product_id    int,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (order_draft_id, position)
);
create index on order_draft_lines (tenant_id, order_draft_id);

-- 11. odoo_sync_attempts
create table odoo_sync_attempts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  order_draft_id uuid not null references order_drafts(id) on delete cascade,
  attempt_key    text not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  outcome        text check (outcome in ('success','error')),
  odoo_so_id     int,
  error_code     text,
  error_message  text,
  request_meta   jsonb not null default '{}',
  response_meta  jsonb not null default '{}',
  unique (order_draft_id, attempt_key)
);
create index on odoo_sync_attempts (tenant_id, order_draft_id, started_at desc);

-- 12. credit_ledger
create table credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  kind            text not null check (kind in ('grant','debit','refund','adjustment')),
  amount          int not null,
  document_id     uuid references documents(id),
  stripe_event_id text,
  note            text,
  created_at      timestamptz not null default now(),
  unique (kind, document_id) deferrable initially deferred
);
create index on credit_ledger (tenant_id, created_at desc);

-- 13. workflow_events
create table workflow_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  run_id      uuid,
  stage       text not null,
  outcome     text not null check (outcome in ('ok','retry','fail')),
  duration_ms int,
  error_code  text,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index on workflow_events (tenant_id, document_id, created_at desc);
create index on workflow_events (tenant_id, stage, outcome);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

create trigger set_updated_at_tenants before update on tenants
  for each row execute function set_updated_at();
create trigger set_updated_at_odoo_connections before update on odoo_connections
  for each row execute function set_updated_at();
create trigger set_updated_at_documents before update on documents
  for each row execute function set_updated_at();
create trigger set_updated_at_customer_mappings before update on customer_mappings
  for each row execute function set_updated_at();
create trigger set_updated_at_product_mappings before update on product_mappings
  for each row execute function set_updated_at();
create trigger set_updated_at_order_drafts before update on order_drafts
  for each row execute function set_updated_at();
create trigger set_updated_at_order_draft_lines before update on order_draft_lines
  for each row execute function set_updated_at();

-- ============================================================
-- HELPER FUNCTIONS (after tenant_members exists)
-- ============================================================

create or replace function is_tenant_member(t uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from tenant_members where user_id = auth.uid() and tenant_id = t
  );
$$;

create or replace function is_tenant_owner(t uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from tenant_members
     where user_id = auth.uid() and tenant_id = t and role = 'owner'
  );
$$;

-- ============================================================
-- RLS — enable + policies (after all tables + helpers exist)
-- ============================================================

-- tenants
alter table tenants enable row level security;
create policy "tenants: members read" on tenants for select
  using (is_tenant_member(id));

-- tenant_members
alter table tenant_members enable row level security;
create policy "tenant_members: read own" on tenant_members for select
  using (user_id = auth.uid() or is_tenant_member(tenant_id));
create policy "tenant_members: owners insert" on tenant_members for insert
  with check (is_tenant_owner(tenant_id));
create policy "tenant_members: owners delete" on tenant_members for delete
  using (is_tenant_owner(tenant_id));

-- odoo_connections
alter table odoo_connections enable row level security;
create policy "odoo_connections: owners read" on odoo_connections for select
  using (is_tenant_owner(tenant_id));
create policy "odoo_connections: owners update" on odoo_connections for update
  using (is_tenant_owner(tenant_id));

-- documents
alter table documents enable row level security;
create policy "documents: members read" on documents for select
  using (is_tenant_member(tenant_id));
create policy "documents: members update" on documents for update
  using (is_tenant_member(tenant_id));

-- document_pages
alter table document_pages enable row level security;
create policy "document_pages: members read" on document_pages for select
  using (is_tenant_member(tenant_id));

-- extractions
alter table extractions enable row level security;
create policy "extractions: members read" on extractions for select
  using (is_tenant_member(tenant_id));

-- customer_mappings
alter table customer_mappings enable row level security;
create policy "customer_mappings: members all" on customer_mappings for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

-- product_mappings
alter table product_mappings enable row level security;
create policy "product_mappings: members all" on product_mappings for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

-- order_drafts
alter table order_drafts enable row level security;
create policy "order_drafts: members read" on order_drafts for select
  using (is_tenant_member(tenant_id));
create policy "order_drafts: members update" on order_drafts for update
  using (is_tenant_member(tenant_id));

-- order_draft_lines
alter table order_draft_lines enable row level security;
create policy "order_draft_lines: members all" on order_draft_lines for all
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

-- odoo_sync_attempts
alter table odoo_sync_attempts enable row level security;
create policy "odoo_sync_attempts: members read" on odoo_sync_attempts for select
  using (is_tenant_member(tenant_id));

-- credit_ledger
alter table credit_ledger enable row level security;
create policy "credit_ledger: members read" on credit_ledger for select
  using (is_tenant_member(tenant_id));

-- workflow_events
alter table workflow_events enable row level security;
create policy "workflow_events: members read" on workflow_events for select
  using (is_tenant_member(tenant_id));

-- ============================================================
-- VIEWS
-- ============================================================

create view credit_balances as
  select
    tenant_id,
    sum(case
      when kind in ('grant','refund','adjustment') then amount
      when kind = 'debit' then -amount
    end) as balance
  from credit_ledger
  group by tenant_id;
