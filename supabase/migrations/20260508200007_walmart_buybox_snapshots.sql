-- Buy Box insights snapshots. The Walmart Buy Box endpoint is async (creates
-- a report, polls for READY); we run it daily and persist the result here.
-- Used for the Buy Box dashboard tab to show winning/losing items + price gap.

create table walmart_buybox_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  walmart_item_id text not null,
  is_winning boolean not null,
  our_price numeric(10,2),
  buybox_price numeric(10,2),
  competitor_count int,
  taken_at timestamptz not null default now()
);

create index walmart_bb_snap_idx
  on walmart_buybox_snapshots (tenant_id, walmart_item_id, taken_at desc);
create index walmart_bb_losing_idx
  on walmart_buybox_snapshots (tenant_id, is_winning, taken_at desc) where is_winning = false;

alter table walmart_buybox_snapshots enable row level security;
create policy "walmart_bb_snap: members read" on walmart_buybox_snapshots for select
  using (is_tenant_member(tenant_id));
create policy "walmart_bb_snap: members insert" on walmart_buybox_snapshots for insert
  with check (is_tenant_member(tenant_id));
