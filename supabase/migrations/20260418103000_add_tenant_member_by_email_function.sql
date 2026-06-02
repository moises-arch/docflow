create or replace function add_tenant_member_by_email(
  p_tenant_id uuid,
  p_email text,
  p_role text default 'member'
)
returns table (
  member_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if not is_tenant_owner(p_tenant_id) then
    raise exception 'Owner access required';
  end if;

  if p_role not in ('owner', 'member') then
    raise exception 'Invalid role';
  end if;

  select u.id
    into v_user_id
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
   limit 1;

  if v_user_id is null then
    raise exception 'User not found';
  end if;

  return query
    insert into tenant_members (tenant_id, user_id, role)
    values (p_tenant_id, v_user_id, p_role)
    on conflict (tenant_id, user_id)
    do update set role = excluded.role
    returning tenant_members.id, tenant_members.user_id, tenant_members.role, tenant_members.created_at;
end;
$$;

revoke all on function add_tenant_member_by_email(uuid, text, text) from public;
grant execute on function add_tenant_member_by_email(uuid, text, text) to authenticated;
