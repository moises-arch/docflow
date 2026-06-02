-- Track Rithum (CommerceHub) orders dispatched from OrderAlertList email
-- notifications. Mirror of cleo_orders. The runner uses this for idempotency
-- (don't re-download an order that already finished) and the UI uses it to
-- show download status. Rithum has a short download window — once an
-- operator acts on the order in the dashboard, the PDF/print action may
-- disappear. State 'manual_required' captures that case so we can flag the
-- operator that the document needs to be uploaded by hand.

create table rithum_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  rithum_order_number text not null,
  rithum_partner text,
  rithum_status text,
  inbound_email_id uuid references inbound_emails(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  state text not null default 'pending'
    check (state in ('pending','running','downloaded','failed','manual_required')),
  attempts int not null default 0,
  last_error text,
  parsed_payload jsonb,
  pdf_source text check (pdf_source in ('native_download','html_render')),
  html_storage_path text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rithum_order_number)
);

create index rithum_orders_tenant_state_idx
  on rithum_orders (tenant_id, state, created_at desc);
create index rithum_orders_inbound_email_idx
  on rithum_orders (inbound_email_id)
  where inbound_email_id is not null;
create index rithum_orders_parsed_idx
  on rithum_orders ((parsed_payload is not null));

create trigger set_updated_at_rithum_orders before update on rithum_orders
  for each row execute function set_updated_at();

alter table rithum_orders enable row level security;
create policy "rithum_orders: members read" on rithum_orders for select
  using (is_tenant_member(tenant_id));
create policy "rithum_orders: members all" on rithum_orders for all
  using (is_tenant_member(tenant_id))
  with check (is_tenant_member(tenant_id));
