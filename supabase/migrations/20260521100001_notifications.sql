-- notifications + notification_reads + 2 triggers + realtime publication
-- Aplicado manualmente vía Supabase Studio el 2026-05-21 (CLI password unavailable).

create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source text not null check (source in ('workflow_event', 'odoo_sync', 'healthcheck', 'admin')),
  source_id uuid,
  severity text not null check (severity in ('info', 'success', 'warning', 'error')),
  title text not null,
  description text,
  href text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index notifications_tenant_created_idx on notifications (tenant_id, created_at desc);
create index notifications_tenant_severity_idx on notifications (tenant_id, severity);

alter table notifications enable row level security;
create policy "notifications: members read" on notifications
  for select using (is_tenant_member(tenant_id));

comment on table notifications is
  'Inbox curada de eventos operativos (docs, sync Odoo, healthchecks, admin). Render del header bell + /notificaciones.';

create table notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid not null references notifications(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

alter table notification_reads enable row level security;
create policy "notification_reads: own rows" on notification_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table notification_reads is
  'Estado read/unread per-user. Una notificación sin row es unread para ese usuario.';

create or replace function notify_from_workflow_event() returns trigger as $$
declare
  v_title text;
  v_severity text;
  v_href text;
  v_is_failure boolean;
  v_is_success_milestone boolean;
  v_success_milestones text[] := array[
    'ingest',
    'ai_process_complete',
    'odoo_sync',
    'document_approved',
    'cross_tenant_product_autoheal'
  ];
begin
  v_is_failure := new.outcome in ('fail', 'error');
  v_is_success_milestone := new.outcome in ('ok', 'success') and new.stage = any(v_success_milestones);

  if not (v_is_failure or v_is_success_milestone) then
    return new;
  end if;

  v_severity := case when v_is_failure then 'error' else 'success' end;

  v_title := case new.stage
    when 'ingest' then 'Nuevo documento recibido'
    when 'ai_process_complete' then 'Documento procesado con IA'
    when 'ai_process_failed' then 'Procesamiento IA falló'
    when 'odoo_sync' then
      case when v_is_failure then 'Sync de orden a Odoo falló' else 'Orden sincronizada a Odoo' end
    when 'odoo_sync_completed' then 'Orden sincronizada a Odoo'
    when 'odoo_sync_failed' then 'Sync de orden a Odoo falló'
    when 'document_approved' then 'Documento aprobado'
    when 'cross_tenant_product_violation' then 'Producto cross-tenant bloqueado'
    when 'cross_tenant_product_autoheal' then 'Producto cross-tenant auto-curado'
    else replace(initcap(new.stage), '_', ' ')
  end;

  v_href := case
    when new.document_id is not null then '/processed/' || new.document_id::text
    else null
  end;

  insert into notifications (tenant_id, source, source_id, severity, title, description, href, meta)
  values (
    new.tenant_id,
    'workflow_event',
    new.id,
    v_severity,
    v_title,
    new.error_code,
    v_href,
    coalesce(new.meta, '{}'::jsonb)
  );

  return new;
end;
$$ language plpgsql security definer;

create trigger notify_workflow_events
  after insert on workflow_events
  for each row execute function notify_from_workflow_event();

create or replace function notify_from_odoo_sync() returns trigger as $$
begin
  if new.finished_at is null or old.finished_at is not null then
    return new;
  end if;

  insert into notifications (tenant_id, source, source_id, severity, title, description, href, meta)
  values (
    new.tenant_id,
    'odoo_sync',
    new.id,
    case when new.ok then 'success' else 'error' end,
    case
      when new.ok and new.scope = 'products' then 'Sync de productos completada'
      when new.ok and new.scope = 'catalog' then 'Sync de clientes y referencias completada'
      when new.ok and new.scope = 'schema' then 'Sync de schema completada'
      when not new.ok and new.scope = 'products' then 'Sync de productos falló'
      when not new.ok and new.scope = 'catalog' then 'Sync de clientes y referencias falló'
      when not new.ok and new.scope = 'schema' then 'Sync de schema falló'
      else new.scope || ' sync'
    end,
    case
      when new.ok then 'Importados: ' || coalesce(new.imported::text, '0')
        || coalesce(' · Desactivados: ' || new.deactivated::text, '')
      else new.error
    end,
    null,
    '{}'::jsonb
  );

  return new;
end;
$$ language plpgsql security definer;

create trigger notify_odoo_sync
  after update on odoo_sync_runs
  for each row execute function notify_from_odoo_sync();

-- Realtime publication
alter publication supabase_realtime add table notifications;
