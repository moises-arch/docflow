-- Allow tenant owners to UPDATE their own tenant row.
-- Without this, settings like auto_approve_clean silently fail to persist:
-- RLS blocks the write (0 rows affected) and Supabase returns no error.
create policy "tenants: owners update" on tenants for update
  using (is_tenant_owner(id))
  with check (is_tenant_owner(id));
