-- Deepen email ingest durability and supported source formats.

update storage.buckets
set
  file_size_limit = 26214400,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/html',
    'text/plain',
    'message/rfc822',
    'application/json'
  ]
where id = 'documents';

create unique index if not exists email_ingest_sources_tenant_address_lower_active_idx
  on email_ingest_sources (tenant_id, lower(address))
  where status <> 'archived';

create index if not exists email_ingest_sources_provider_idx
  on email_ingest_sources (provider_id)
  where provider_id is not null;

alter table inbound_email_attachments
  add column if not exists state text not null default 'stored'
    check (state in ('stored','document_created','unsupported','failed')),
  add column if not exists sha256 text;

create index if not exists inbound_email_attachments_state_idx
  on inbound_email_attachments (tenant_id, state, created_at desc);

create table if not exists email_ingest_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  ingest_source_id uuid references email_ingest_sources(id) on delete set null,
  inbound_email_id uuid references inbound_emails(id) on delete set null,
  adapter text not null,
  event_id text,
  state text not null
    check (state in ('accepted','duplicate','rejected','failed')),
  status_code int,
  error_code text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists email_ingest_events_adapter_event_id_idx
  on email_ingest_events (adapter, event_id)
  where event_id is not null;

create index if not exists email_ingest_events_tenant_created_idx
  on email_ingest_events (tenant_id, created_at desc)
  where tenant_id is not null;

alter table email_ingest_events enable row level security;

drop policy if exists "email_ingest_events: members read" on email_ingest_events;
create policy "email_ingest_events: members read" on email_ingest_events for select
  using (tenant_id is not null and is_tenant_member(tenant_id));
