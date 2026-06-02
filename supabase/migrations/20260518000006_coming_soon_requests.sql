-- B20: Coming-soon signup persistence
-- The integrations directory shows a "Notify me when ready" form for not-yet-built
-- integrations. Until now, clicks went nowhere (a TODO in the component).
-- This table captures expressions of interest so product can prioritize.

create table if not exists coming_soon_requests (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete set null,
  user_id         uuid references auth.users(id) on delete set null,
  integration_id  text not null,         -- slug from integrations registry
  integration_name text not null,        -- denormalized for product visibility
  email           text not null,
  ip              text,                  -- for spam/abuse detection
  user_agent      text,
  created_at      timestamptz not null default now()
);

-- Per-integration aggregation index (product runs reports here)
create index if not exists coming_soon_requests_integration_idx
  on coming_soon_requests (integration_id, created_at desc);

-- Anti-spam: stop the same email signing up to the same integration repeatedly.
create unique index if not exists coming_soon_requests_unique_idx
  on coming_soon_requests (integration_id, email);

alter table coming_soon_requests enable row level security;

-- Anyone authenticated can INSERT their own signup. Only owners can SELECT
-- (product analytics) — never share other people's interest signals.
create policy "coming_soon_requests: members insert"
  on coming_soon_requests for insert
  with check (auth.uid() is not null);

create policy "coming_soon_requests: owners read"
  on coming_soon_requests for select
  using (
    exists (
      select 1 from tenant_members tm
       where tm.user_id = auth.uid()
         and tm.role = 'owner'
    )
  );

comment on table coming_soon_requests is
  'Expression-of-interest signups from the Integrations marketplace for not-yet-shipped integrations.';
