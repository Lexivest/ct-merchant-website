-- Pass 1: clean login security, hide guard internals, and keep reinstatement staff-only.

begin;

drop function if exists public.ctm_log_login_guard_debug(text, text, uuid, jsonb);
drop table if exists public.login_security_guard_debug_log;

drop function if exists public.ctm_get_login_guard_status(text);
drop function if exists public.ctm_register_wrong_password_attempt(text);
drop function if exists public.ctm_reset_login_guard_after_success(text);
drop function if exists public.check_user_login_access(text);
drop function if exists public.register_failed_login(text);
drop function if exists public.ctm_security_check(text, boolean);
drop function if exists public.get_user_security_status(text);

drop view if exists public.vw_security_master;
drop view if exists public.vw_security_status;
drop view if exists public.vw_security_heartbeat;

alter table if exists public.login_security_guards enable row level security;
revoke all on table public.login_security_guards from anon, authenticated;

create or replace function public.ctm_is_login_guard_suspended(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if p_user_id is null then
    return false;
  end if;

  if auth.uid() is not null
    and auth.uid() <> p_user_id
    and not public.is_staff_member()
    and public.get_admin_role() is null
  then
    return false;
  end if;

  return exists (
    select 1
    from public.login_security_guards lsg
    where lsg.user_id = p_user_id
      and lsg.suspended_at is not null
  );
end;
$$;

grant execute on function public.ctm_is_login_guard_suspended(uuid) to authenticated, service_role;

create or replace function public.ctm_security_heartbeat(
  p_email text,
  p_action text default 'CHECK'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_user_id uuid;
  v_normalized_email text := lower(trim(coalesce(p_email, '')));
  v_action text := upper(trim(coalesce(p_action, 'CHECK')));
  v_payload jsonb;
begin
  if v_normalized_email = '' then
    return jsonb_build_object(
      'status', 'CLEAR',
      'is_blocked', false,
      'remaining', 3,
      'is_staff', false,
      'user_id', null
    );
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email) = v_normalized_email
  limit 1;

  if v_user_id is not null and v_action = 'FAILURE' then
    insert into public.login_security_guards (
      email,
      user_id,
      failed_attempts,
      last_failed_at,
      suspended_at,
      suspension_reason,
      updated_at
    )
    values (
      v_normalized_email,
      v_user_id,
      1,
      now(),
      null,
      null,
      now()
    )
    on conflict (email) do update
    set
      user_id = coalesce(excluded.user_id, public.login_security_guards.user_id),
      failed_attempts = case
        when public.login_security_guards.suspended_at is not null then greatest(public.login_security_guards.failed_attempts, 3)
        else least(public.login_security_guards.failed_attempts + 1, 3)
      end,
      last_failed_at = now(),
      suspended_at = case
        when public.login_security_guards.suspended_at is not null then public.login_security_guards.suspended_at
        when public.login_security_guards.failed_attempts + 1 >= 3 then now()
        else null
      end,
      suspension_reason = case
        when public.login_security_guards.suspended_at is not null then coalesce(public.login_security_guards.suspension_reason, 'too_many_wrong_password_attempts')
        when public.login_security_guards.failed_attempts + 1 >= 3 then 'too_many_wrong_password_attempts'
        else null
      end,
      updated_at = now();
  elsif v_user_id is not null and v_action = 'SUCCESS' then
    -- A correct password may clear warning attempts, but it must never reinstate a suspended account.
    update public.login_security_guards
    set
      failed_attempts = 0,
      last_failed_at = null,
      last_success_at = now(),
      updated_at = now()
    where email = v_normalized_email
      and suspended_at is null;
  end if;

  select jsonb_build_object(
    'status',
    case
      when coalesce(p.is_suspended, false) then 'SUSPENDED'
      when lsg.suspended_at is not null then 'BRUTE_FORCE_LOCK'
      else 'CLEAR'
    end,
    'is_blocked', (coalesce(p.is_suspended, false) or lsg.suspended_at is not null),
    'remaining', greatest(0, 3 - coalesce(lsg.failed_attempts, 0)),
    'is_staff', (sp.id is not null),
    'user_id', u.id
  )
  into v_payload
  from auth.users u
  left join public.profiles p
    on p.id = u.id
  left join public.login_security_guards lsg
    on lsg.email = lower(u.email)
  left join public.staff_profiles sp
    on sp.id = u.id
  where lower(u.email) = v_normalized_email
  limit 1;

  if v_payload is null then
    return jsonb_build_object(
      'status', 'CLEAR',
      'is_blocked', false,
      'remaining', 3,
      'is_staff', false,
      'user_id', v_user_id
    );
  end if;

  return v_payload;
end;
$$;

grant execute on function public.ctm_security_heartbeat(text, text) to anon, authenticated;

create or replace function public.ctm_staff_update_user_status(
  p_user_id uuid,
  p_email text,
  p_suspend boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_normalized_email text := lower(trim(coalesce(p_email, '')));
  v_resolved_email text;
begin
  if not public.is_staff_member() then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'User id is required' using errcode = '22023';
  end if;

  if v_normalized_email = '' then
    select lower(u.email)
    into v_resolved_email
    from auth.users u
    where u.id = p_user_id
    limit 1;

    v_normalized_email := coalesce(v_resolved_email, '');
  end if;

  if v_normalized_email = '' then
    raise exception 'User email could not be resolved' using errcode = '22023';
  end if;

  update public.profiles
  set is_suspended = p_suspend
  where id = p_user_id;

  if p_suspend then
    insert into public.login_security_guards (
      email,
      user_id,
      failed_attempts,
      suspended_at,
      suspension_reason,
      updated_at
    )
    values (
      v_normalized_email,
      p_user_id,
      3,
      now(),
      coalesce(nullif(trim(p_reason), ''), 'Manual staff suspension'),
      now()
    )
    on conflict (email) do update
    set
      user_id = coalesce(excluded.user_id, public.login_security_guards.user_id),
      failed_attempts = greatest(public.login_security_guards.failed_attempts, 3),
      suspended_at = now(),
      suspension_reason = coalesce(nullif(trim(p_reason), ''), 'Manual staff suspension'),
      updated_at = now();
  else
    update public.login_security_guards
    set
      failed_attempts = 0,
      suspended_at = null,
      suspension_reason = null,
      last_failed_at = null,
      last_success_at = now(),
      updated_at = now()
    where email = v_normalized_email
       or user_id = p_user_id;
  end if;

  return true;
end;
$$;

grant execute on function public.ctm_staff_update_user_status(uuid, text, boolean, text) to authenticated;

drop view if exists public.vw_user_profiles;
create view public.vw_user_profiles
with (security_invoker = true)
as
select
  p.id,
  p.full_name,
  p.phone,
  p.avatar_url,
  (coalesce(p.is_suspended, false) or public.ctm_is_login_guard_suspended(p.id)) as is_suspended,
  p.city_id,
  c.name as city_name,
  p.area_id,
  a.name as area_name,
  case
    when adm.id is not null then adm.role::text
    when sp.id is not null then (case when sp.role = 'director' then 'super_admin' else 'staff' end)
    else 'user'
  end as role,
  p.created_at
from public.profiles p
left join public.cities c
  on p.city_id = c.id
left join public.areas a
  on p.area_id = a.id
left join public.admins adm
  on p.id = adm.id
left join public.staff_profiles sp
  on p.id = sp.id;

alter view public.vw_user_profiles owner to postgres;
grant select on table public.vw_user_profiles to authenticated;
grant select on table public.vw_user_profiles to service_role;

commit;
