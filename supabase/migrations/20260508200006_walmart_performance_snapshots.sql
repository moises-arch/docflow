-- Daily snapshot of Walmart Seller Performance scorecard metrics.
-- Used for trend charts in the Performance dashboard tab.

create table walmart_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  on_time_delivery_rate numeric(5,4),    -- 0.9876 = 98.76%
  valid_tracking_rate numeric(5,4),
  seller_response_rate numeric(5,4),
  refund_rate numeric(5,4),
  cancellation_rate numeric(5,4),
  raw_data jsonb,
  taken_at timestamptz not null default now()
);

create index walmart_perf_snap_idx
  on walmart_performance_snapshots (tenant_id, taken_at desc);

alter table walmart_performance_snapshots enable row level security;
create policy "walmart_perf_snap: members read" on walmart_performance_snapshots for select
  using (is_tenant_member(tenant_id));
create policy "walmart_perf_snap: members insert" on walmart_performance_snapshots for insert
  with check (is_tenant_member(tenant_id));
