-- Track Cleo WebEDI orders dispatched from email notifications. The runner
-- uses this for idempotency (don't re-download a message that already
-- finished) and the UI uses it to show download status.

create table cleo_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  cleo_message_id text not null,
  cleo_reference text,
  cleo_batch_id text,
  trading_partner text,
  inbound_email_id uuid references inbound_emails(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  state text not null default 'pending'
    check (state in ('pending','running','downloaded','failed')),
  attempts int not null default 0,
  last_error text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, cleo_message_id)
);

create index cleo_orders_tenant_state_idx
  on cleo_orders (tenant_id, state, created_at desc);
create index cleo_orders_inbound_email_idx
  on cleo_orders (inbound_email_id)
  where inbound_email_id is not null;

create trigger set_updated_at_cleo_orders before update on cleo_orders
  for each row execute function set_updated_at();

alter table cleo_orders enable row level security;
create policy "cleo_orders: members read" on cleo_orders for select
  using (is_tenant_member(tenant_id));
create policy "cleo_orders: members all" on cleo_orders for all
  using (is_tenant_member(tenant_id))
  with check (is_tenant_member(tenant_id));
