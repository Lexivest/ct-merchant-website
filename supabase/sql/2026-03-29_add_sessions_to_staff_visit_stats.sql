create or replace function public.staff_site_visit_daily(
  p_days integer default 30
)
returns table (
  visit_date date,
  total_visits bigint,
  unique_visitors bigint,
  authenticated_visits bigint,
  total_sessions bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff_member() then
    raise exception 'Access denied'
      using errcode = '42501';
  end if;

  return query
  select
    (timezone('Africa/Lagos', sve.created_at))::date as visit_date,
    count(*)::bigint as total_visits,
    count(distinct sve.visitor_key)::bigint as unique_visitors,
    count(*) filter (where sve.is_authenticated)::bigint as authenticated_visits,
    count(distinct sve.session_key)::bigint as total_sessions
  from public.site_visit_events sve
  where sve.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1) - 1)
  group by 1
  order by 1 asc;
end;
$$;

grant execute on function public.staff_site_visit_daily(integer) to authenticated;
