alter table documents
  drop constraint if exists documents_source_channel_check;

alter table documents
  add constraint documents_source_channel_check
  check (source_channel in ('upload','email','api','browser'));

create table browser_ingest_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_id uuid references providers(id) on delete set null,
  name text not null,
  portal_url text not null,
  login_url text,
  status text not null default 'active'
    check (status in ('active','paused','archived','needs_attention')),
  schedule_enabled boolean not null default false,
  schedule_note text,
  selectors jsonb not null default '{}',
  settings jsonb not null default '{}',
  last_run_at timestamptz,
  last_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index browser_ingest_connections_tenant_status_idx
  on browser_ingest_connections (tenant_id, status, created_at desc);
create index browser_ingest_connections_provider_idx
  on browser_ingest_connections (tenant_id, provider_id);

create table browser_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  connection_id uuid not null references browser_ingest_connections(id) on delete cascade,
  provider_id uuid references providers(id) on delete set null,
  triggered_by uuid references auth.users(id) on delete set null,
  trigger_type text not null default 'manual'
    check (trigger_type in ('manual','cron','api')),
  state text not null default 'queued'
    check (state in ('queued','running','processed','needs_attention','failed')),
  started_at timestamptz,
  finished_at timestamptz,
  documents_created int not null default 0,
  artifacts_created int not null default 0,
  error_code text,
  error_message text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index browser_ingest_runs_connection_idx
  on browser_ingest_runs (connection_id, created_at desc);
create index browser_ingest_runs_tenant_state_idx
  on browser_ingest_runs (tenant_id, state, created_at desc);

create table browser_ingest_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  run_id uuid not null references browser_ingest_runs(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  artifact_type text not null
    check (artifact_type in ('download','screenshot','html','log')),
  storage_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  sha256 text,
  state text not null default 'stored'
    check (state in ('stored','document_created','ignored','failed')),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index browser_ingest_artifacts_run_idx
  on browser_ingest_artifacts (run_id, created_at desc);
create index browser_ingest_artifacts_document_idx
  on browser_ingest_artifacts (document_id)
  where document_id is not null;

create trigger set_updated_at_browser_ingest_connections before update on browser_ingest_connections
  for each row execute function set_updated_at();

alter table browser_ingest_connections enable row level security;
create policy "browser_ingest_connections: members all" on browser_ingest_connections for all
  using (is_tenant_member(tenant_id))
  with check (is_tenant_member(tenant_id));

alter table browser_ingest_runs enable row level security;
create policy "browser_ingest_runs: members read" on browser_ingest_runs for select
  using (is_tenant_member(tenant_id));
create policy "browser_ingest_runs: members insert" on browser_ingest_runs for insert
  with check (is_tenant_member(tenant_id));
create policy "browser_ingest_runs: members update" on browser_ingest_runs for update
  using (is_tenant_member(tenant_id))
  with check (is_tenant_member(tenant_id));

alter table browser_ingest_artifacts enable row level security;
create policy "browser_ingest_artifacts: members read" on browser_ingest_artifacts for select
  using (is_tenant_member(tenant_id));
