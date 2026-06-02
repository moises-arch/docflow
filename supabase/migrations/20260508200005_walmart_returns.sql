-- Walmart returns cache. Synced every 6h from /v3/returns.
-- UPSERTed by return_order_id.

create table walmart_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  return_order_id text not null,
  customer_order_id text,
  walmart_po_id text,
  return_status text,                    -- INITIATED | DELIVERED | COMPLETED
  return_reason text,
  refund_amount numeric(10,2),
  refund_status text,
  return_lines jsonb,
  raw_data jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, return_order_id)
);

create index walmart_returns_tenant_status_idx
  on walmart_returns (tenant_id, return_status, created_at desc);
create index walmart_returns_po_idx
  on walmart_returns (tenant_id, walmart_po_id) where walmart_po_id is not null;

alter table walmart_returns enable row level security;
create policy "walmart_returns: members read" on walmart_returns for select
  using (is_tenant_member(tenant_id));
create policy "walmart_returns: members all" on walmart_returns for all
  using (is_tenant_member(tenant_id))
  with check (is_tenant_member(tenant_id));
