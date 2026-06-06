-- Remove the raw page-view ("total_visits") logic entirely.
--
-- The site now reports only privacy-preserving unique visitor counts. The
-- per-navigation page-view counter and its read paths are dropped:
--   * record_site_visit() writer is removed
--   * staff_site_visit_daily() returns only the unique counters
--   * the dashboard "visits today" tile now reflects unique visitors
--
-- The historical daily_site_visits.total_visits / authenticated_visits columns
-- are kept in place (non-destructive) but are no longer written or read.

begin;

-- 1. Drop the page-view writer (public wrapper depends on private impl).
drop function if exists public.record_site_visit(text, text, text, text);
drop function if exists private.record_site_visit(text, text, text, text);

-- 2. Reader returns only unique counters now.
drop function if exists public.staff_site_visit_daily(integer);
drop function if exists private.staff_site_visit_daily(integer);

create function private.staff_site_visit_daily(p_days integer default 30)
returns table(
  visit_date date,
  unique_visitors bigint,
  unique_home_visits bigint
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
    dsv.unique_visits as unique_visitors,
    dsv.unique_home_visits
  from public.daily_site_visits dsv
  where dsv.visit_date >= (timezone('Africa/Lagos', now()))::date
    - make_interval(days => greatest(coalesce(p_days, 30), 1) - 1)
  order by dsv.visit_date asc;
end;
$$;

create function public.staff_site_visit_daily(p_days integer default 30)
returns table(
  visit_date date,
  unique_visitors bigint,
  unique_home_visits bigint
)
language sql
set search_path to 'public', 'private', 'pg_temp'
as $$
  select * from private.staff_site_visit_daily(p_days);
$$;

grant execute on function public.staff_site_visit_daily(integer) to authenticated, service_role;

-- 3. Repoint the dashboard "visits today" tile from page views to unique visitors.
create or replace function private.get_staff_dashboard_payload(p_is_super_admin boolean, p_city_id bigint default null::bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'auth', 'private'
as $function$
DECLARE
  v_result jsonb;
  v_now_lagos date := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_admin_role public.admin_role;
  v_is_super_admin boolean := false;
  v_scope_city_id bigint := NULL;
BEGIN
  IF NOT private.is_staff_member() THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  v_admin_role := private.get_admin_role();
  v_is_super_admin := v_admin_role = 'super_admin'::public.admin_role;
  v_scope_city_id := CASE
    WHEN v_is_super_admin THEN p_city_id
    ELSE private.get_admin_city()
  END;

  IF v_admin_role IS NULL THEN
    RETURN jsonb_build_object(
      'summary', jsonb_build_object(
        'shop_count', 0,
        'inactive_users_count', 0,
        'visits_today', 0
      ),
      'counts', jsonb_build_object(
        'verifications', 0,
        'products', 0,
        'payments', 0,
        'community', 0,
        'content', 0,
        'inbox', 0,
        'radar', 0
      )
    );
  END IF;

  IF NOT v_is_super_admin AND v_scope_city_id IS NULL THEN
    RAISE EXCEPTION 'Admin city scope is missing.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'shop_count', (
        SELECT count(*)::int
        FROM public.shops s
        WHERE v_scope_city_id IS NULL OR s.city_id = v_scope_city_id
      ),
      'inactive_users_count', (
        SELECT count(*)::int
        FROM auth.users u
        LEFT JOIN public.profiles p ON p.id = u.id
        LEFT JOIN public.staff_profiles sp ON sp.id = u.id
        LEFT JOIN public.admins adm ON adm.id = u.id
        WHERE sp.id IS NULL
          AND u.email IS NOT NULL
          AND (v_scope_city_id IS NULL OR p.city_id = v_scope_city_id)
          AND (v_is_super_admin OR adm.role IS DISTINCT FROM 'super_admin'::public.admin_role)
          AND coalesce(u.last_sign_in_at, u.created_at) <= now() - interval '180 days'
      ),
      'visits_today', (
        SELECT coalesce(sum(dsv.unique_visits), 0)::int
        FROM public.daily_site_visits dsv
        WHERE dsv.visit_date = v_now_lagos
      )
    ),
    'counts', jsonb_build_object(
      'verifications', (
        (
          SELECT count(*)::int
          FROM public.shops s
          WHERE s.status = 'pending'
            AND (v_scope_city_id IS NULL OR s.city_id = v_scope_city_id)
        ) +
        CASE
          WHEN v_is_super_admin THEN (
            SELECT count(*)::int
            FROM public.shops s
            WHERE s.kyc_status = 'submitted'
              AND (v_scope_city_id IS NULL OR s.city_id = v_scope_city_id)
          )
          ELSE 0
        END
      ),
      'products', (
        SELECT count(*)::int
        FROM public.products p
        JOIN public.shops s ON p.shop_id = s.id
        WHERE p.is_approved = false
          AND p.rejection_reason IS NULL
          AND (v_scope_city_id IS NULL OR s.city_id = v_scope_city_id)
      ),
      'payments', (
        CASE
          WHEN v_is_super_admin THEN (
            SELECT count(*)::int
            FROM public.offline_payment_proofs opp
            WHERE opp.status = 'pending'
          )
          ELSE 0
        END
      ),
      'community', (
        SELECT count(*)::int
        FROM public.shop_comments c
        JOIN public.shops s ON c.shop_id = s.id
        WHERE c.status = 'pending'
          AND (v_scope_city_id IS NULL OR s.city_id = v_scope_city_id)
      ),
      'content', (
        SELECT count(*)::int
        FROM public.shop_banners_news bn
        JOIN public.shops s ON bn.shop_id = s.id
        WHERE bn.status = 'pending'
          AND (v_scope_city_id IS NULL OR s.city_id = v_scope_city_id)
      ),
      'inbox', (
        (
          SELECT count(*)::int
          FROM public.contact_messages cm
          WHERE cm.status = 'unread' OR cm.status IS NULL
        ) +
        (
          SELECT count(*)::int
          FROM public.abuse_reports r
          JOIN public.profiles p ON r.reporter_id = p.id
          WHERE (r.status = 'pending' OR r.status IS NULL)
            AND (v_scope_city_id IS NULL OR p.city_id = v_scope_city_id)
        )
      ),
      'radar', (
        CASE
          WHEN v_is_super_admin THEN (
            SELECT count(*)::int
            FROM private.ctm_get_security_radar_insights()
          )
          ELSE 0
        END
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

revoke all on function private.get_staff_dashboard_payload(boolean, bigint) from public;
grant execute on function private.get_staff_dashboard_payload(boolean, bigint) to authenticated, service_role;

commit;
