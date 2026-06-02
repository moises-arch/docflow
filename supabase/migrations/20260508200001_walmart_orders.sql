-- Walmart Marketplace orders ingestion. Mirror of cleo_orders / rithum_orders
-- but fed by both webhooks (PO_CREATED) and a polling cron (released orders).
--
-- - state: pending → running → downloaded | failed | manual_required
-- - source: tells us if the order arrived via webhook (happy path) or was
--   rescued by the cron (red flag if too many).
-- - raw_response: full JSON from /v3/orders/{id} for audit trail.

create table walmart_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  walmart_po_id text not null,
  customer_order_id text,
  ship_node_id text,
  state text not null default 'pending'
    check (state in ('pending','running','downloaded','failed','manual_required')),
  source text not null default 'webhook'
    check (source in ('webhook','cron_rescue','manual')),
  attempts int not null default 0,
  last_error text,
  document_id uuid references documents(id) on delete set null,
  parsed_payload jsonb,
  raw_response jsonb,
  acknowledged_at timestamptz,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, walmart_po_id)
);

create index walmart_orders_tenant_state_idx
  on walmart_orders (tenant_id, state, created_at desc);
create index walmart_orders_source_idx
  on walmart_orders (tenant_id, source, created_at desc);
create index walmart_orders_document_idx
  on walmart_orders (document_id) where document_id is not null;

create trigger set_updated_at_walmart_orders before update on walmart_orders
  for each row execute function set_updated_at();

alter table walmart_orders enable row level security;
create policy "walmart_orders: members read" on walmart_orders for select
  using (is_tenant_member(tenant_id));
create policy "walmart_orders: members all" on walmart_orders for all
  using (is_tenant_member(tenant_id))
  with check (is_tenant_member(tenant_id));
