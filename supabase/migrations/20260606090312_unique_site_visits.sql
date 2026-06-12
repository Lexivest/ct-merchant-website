-- Unique site-visit tracking (privacy-preserving, no per-visitor storage).
--
-- Dedup happens entirely in the visitor's own browser (localStorage holds the
-- last day it was counted). The server only ever bumps two daily counters and
-- never stores any session key, visitor id, device info, IP, or page path.
--
--   unique_visits      = distinct browsers that opened the site that day
--   unique_home_visits = distinct browsers that opened the homepage that day

begin;

alter table public.daily_site_visits
  add column if not exists unique_visits bigint not null default 0,
  add column if not exists unique_home_visits bigint not null default 0;

-- Writer: called by the client at most once per day per counter.
create or replace function private.record_unique_visit(
  p_count_site boolean default false,
  p_count_home boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today date := (timezone('Africa/Lagos', now()))::date;
  v_site bigint := case when p_count_site then 1 else 0 end;
  v_home bigint := case when p_count_home then 1 else 0 end;
begin
  if v_site = 0 and v_home = 0 then
    return;
  end if;

  insert into public.daily_site_visits (
    visit_date, total_visits, authenticated_visits, unique_visits, unique_home_visits
  )
  values (v_today, 0, 0, v_site, v_home)
  on conflict (visit_date) do update
  set
    unique_visits = public.daily_site_visits.unique_visits + v_site,
    unique_home_visits = public.daily_site_visits.unique_home_visits + v_home;
end;
$$;

create or replace function public.record_unique_visit(
  p_count_site boolean default false,
  p_count_home boolean default false
)
returns void
language sql
set search_path to 'public', 'private', 'pg_temp'
as $$
  select private.record_unique_visit(p_count_site, p_count_home);
$$;

grant execute on function public.record_unique_visit(boolean, boolean) to anon, authenticated;

-- Reader: expose the real unique counters to staff (was previously stubbed to 0).
-- Return signature changes, so the wrapper + impl must be dropped and recreated.
drop function if exists public.staff_site_visit_daily(integer);
drop function if exists private.staff_site_visit_daily(integer);

create function private.staff_site_visit_daily(p_days integer default 30)
returns table(
  visit_date date,
  total_visits bigint,
  unique_visitors bigint,
  unique_home_visits bigint,
  authenticated_visits bigint
)
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
begin
  if not private.ctm_has_staff_access() then
    raise exception 'Admin operation role required.' using errcode = '42501';
  end if;

  return query
  select
    dsv.visit_date,
    dsv.total_visits,
    dsv.unique_visits as unique_visitors,
    dsv.unique_home_visits,
    dsv.authenticated_visits
  from public.daily_site_visits dsv
  where dsv.visit_date >= (timezone('Africa/Lagos', now()))::date
    - make_interval(days => greatest(coalesce(p_days, 30), 1) - 1)
  order by dsv.visit_date asc;
end;
$$;

create function public.staff_site_visit_daily(p_days integer default 30)
returns table(
  visit_date date,
  total_visits bigint,
  unique_visitors bigint,
  unique_home_visits bigint,
  authenticated_visits bigint
)
language sql
set search_path to 'public', 'private', 'pg_temp'
as $$
  select * from private.staff_site_visit_daily(p_days);
$$;

grant execute on function public.staff_site_visit_daily(integer) to authenticated, service_role;

commit;
