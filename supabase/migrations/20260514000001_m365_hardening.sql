-- M365 hardening: renewal log, failed messages, health checks, processing locks.
-- Soporta auto-recuperación, observabilidad y dedup robusto del cron de scan.

-- Log de renovaciones de suscripción
create table if not exists m365_renewal_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid not null references email_ingest_sources(id) on delete cascade,
  action text not null, -- 'renewed' | 'recreated' | 'failed' | 'skipped'
  subscription_id text,
  old_expires_at timestamptz,
  new_expires_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists m365_renewal_log_tenant_created_idx
  on m365_renewal_log(tenant_id, created_at desc);
create index if not exists m365_renewal_log_source_created_idx
  on m365_renewal_log(source_id, created_at desc);

-- Mensajes que fallaron al procesar (para reintentos)
create table if not exists m365_failed_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid not null references email_ingest_sources(id) on delete cascade,
  graph_message_id text not null,
  internet_message_id text,
  attempts int not null default 1,
  last_error text,
  last_attempt_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tenant_id, graph_message_id)
);
create index if not exists m365_failed_messages_unresolved_idx
  on m365_failed_messages(tenant_id, resolved_at)
  where resolved_at is null;

-- Healthchecks
create table if not exists m365_health_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid references email_ingest_sources(id) on delete cascade,
  ok boolean not null,
  checks jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists m365_health_checks_tenant_created_idx
  on m365_health_checks(tenant_id, created_at desc);
create index if not exists m365_health_checks_source_created_idx
  on m365_health_checks(source_id, created_at desc);

-- Locks para idempotencia del scan
create table if not exists m365_processing_locks (
  tenant_id uuid not null references tenants(id) on delete cascade,
  graph_message_id text not null,
  locked_until timestamptz not null,
  primary key (tenant_id, graph_message_id)
);
create index if not exists m365_processing_locks_locked_until_idx
  on m365_processing_locks(locked_until);

-- RLS
alter table m365_renewal_log enable row level security;
alter table m365_failed_messages enable row level security;
alter table m365_health_checks enable row level security;
alter table m365_processing_locks enable row level security;

drop policy if exists "tenant_members read m365_renewal_log" on m365_renewal_log;
create policy "tenant_members read m365_renewal_log" on m365_renewal_log
  for select using (is_tenant_member(tenant_id));

drop policy if exists "tenant_members read m365_failed_messages" on m365_failed_messages;
create policy "tenant_members read m365_failed_messages" on m365_failed_messages
  for select using (is_tenant_member(tenant_id));

drop policy if exists "tenant_members read m365_health_checks" on m365_health_checks;
create policy "tenant_members read m365_health_checks" on m365_health_checks
  for select using (is_tenant_member(tenant_id));

-- Locks: solo service role escribe; sin policies = lectura RLS bloqueada para usuarios.
-- (Service role siempre bypassea RLS.)
