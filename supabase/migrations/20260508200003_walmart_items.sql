-- Walmart catalog cache. Synced daily from /v3/items.
-- One row per Walmart item; UPSERTed on each sync. Used by the dashboard
-- catalog tab without hitting Walmart on every page load.

create table walmart_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  walmart_item_id text not null,
  sku text not null,
  product_name text,
  status text,                           -- ACTIVE | STAGE | RETIRED | ARCHIVED
  publish_status text,                   -- PUBLISHED | UNPUBLISHED | etc.
  upc text,
  category text,
  price numeric(10,2),
  currency text default 'USD',
  ship_node_type text,                   -- SellerFulfilled | WFS
  lag_time_days int,
  buybox_winning boolean,
  buybox_winner_price numeric(10,2),
  inventory_total int,
  inventory_unit text default 'EA',
  last_sale_date timestamptz,
  units_sold_30d int default 0,
  units_sold_90d int default 0,
  raw_data jsonb,
  synced_at timestamptz not null default now(),
  unique (tenant_id, walmart_item_id)
);

create index walmart_items_tenant_status_idx on walmart_items (tenant_id, status);
create index walmart_items_sku_idx on walmart_items (tenant_id, sku);
create index walmart_items_low_stock_idx
  on walmart_items (tenant_id, inventory_total) where inventory_total < 10;
create index walmart_items_top_sellers_idx
  on walmart_items (tenant_id, units_sold_30d desc);

alter table walmart_items enable row level security;
create policy "walmart_items: members read" on walmart_items for select
  using (is_tenant_member(tenant_id));
create policy "walmart_items: members all" on walmart_items for all
  using (is_tenant_member(tenant_id))
  with check (is_tenant_member(tenant_id));
