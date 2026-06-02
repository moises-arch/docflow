-- Periodic snapshots of inventory levels per item. Used for stock trend
-- charts in the dashboard. INSERT-only; janitor cron deletes rows > 365d.

create table walmart_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  walmart_item_id text not null,
  inventory_total int not null,
  taken_at timestamptz not null default now()
);

create index walmart_inv_snap_idx
  on walmart_inventory_snapshots (tenant_id, walmart_item_id, taken_at desc);

alter table walmart_inventory_snapshots enable row level security;
create policy "walmart_inv_snap: members read" on walmart_inventory_snapshots for select
  using (is_tenant_member(tenant_id));
create policy "walmart_inv_snap: members insert" on walmart_inventory_snapshots for insert
  with check (is_tenant_member(tenant_id));
