-- Sistema de notificaciones por email: destinatarios y templates editables.
-- Aplicado manualmente vía Supabase Studio el 2026-05-21 (CLI password no disponible).

create table email_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  name text,
  type text not null check (type in ('order_approved', 'daily_digest', 'all')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index email_recipients_tenant_email_type_idx on email_recipients (tenant_id, email, type);
create index email_recipients_tenant_type_active_idx on email_recipients (tenant_id, type, active);
alter table email_recipients enable row level security;
create policy "email_recipients: members read" on email_recipients for select using (is_tenant_member(tenant_id));
create policy "email_recipients: owner write" on email_recipients for all using (
  tenant_id in (select tenant_id from tenant_members where user_id = auth.uid() and role = 'owner')
);
comment on table email_recipients is 'Destinatarios de notificaciones por email, configurables por tenant y tipo.';

create table email_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null check (type in ('order_approved', 'daily_digest')),
  subject text not null,
  intro text not null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, type)
);
alter table email_templates enable row level security;
create policy "email_templates: members read" on email_templates for select using (is_tenant_member(tenant_id));
create policy "email_templates: owner write" on email_templates for all using (
  tenant_id in (select tenant_id from tenant_members where user_id = auth.uid() and role = 'owner')
);
comment on table email_templates is 'Templates de email editables por tenant (subject + intro). Estructura HTML es fija en código.';
