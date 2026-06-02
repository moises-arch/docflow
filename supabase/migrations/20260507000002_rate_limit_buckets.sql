-- Token-bucket rate limiting per tenant + key.
-- Used by /api/upload (uploads/h) and /api/order-drafts/[id]/retry-sync (retries/h).
-- RLS disabled — only accessed via service-role from server-side code.

create table if not exists rate_limit_buckets (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  key         text not null,
  tokens      integer not null,
  refilled_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

alter table rate_limit_buckets enable row level security;
-- No policies: service role bypasses RLS; clients should never read this table.

comment on table rate_limit_buckets is
  'Token-bucket counters per (tenant_id, key). Refill happens lazily on read.';
