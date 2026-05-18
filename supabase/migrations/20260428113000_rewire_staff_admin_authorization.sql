-- Rewire staff portal authorization:
-- - staff_profiles grants portal entry only
-- - admins grants operation privileges only when the user is also staff
-- - super_admin owns payments, video KYC review, and security radar

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- =========================================================
-- Role helpers
-- =========================================================

CREATE OR REPLACE FUNCTION private.get_admin_role()
RETURNS public.admin_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.role
  FROM public.admins a
  WHERE a.id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.id = a.id
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.get_admin_city()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.city_id
  FROM public.admins a
  WHERE a.id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.id = a.id
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.ctm_has_staff_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'private'
AS $$
  SELECT (SELECT private.get_admin_role()) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION private.ctm_has_admin_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'private'
AS $$
  SELECT (SELECT private.get_admin_role()) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION private.ctm_has_super_staff_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'private', 'public'
AS $$
  SELECT (SELECT private.get_admin_role()) = 'super_admin'::public.admin_role;
$$;

CREATE OR REPLACE FUNCTION private.ctm_current_staff_city_scope()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'private'
AS $$
  SELECT private.get_admin_city();
$$;

REVOKE ALL ON FUNCTION private.get_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_admin_city() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_has_staff_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_has_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_has_super_staff_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_current_staff_city_scope() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.get_admin_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_admin_city() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_has_staff_access() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_has_admin_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_has_super_staff_access() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_current_staff_city_scope() TO anon, authenticated, service_role;

-- =========================================================
-- Dashboard payload: ignore client-supplied role claims
-- =========================================================

CREATE OR REPLACE FUNCTION private.get_staff_dashboard_payload(
  p_is_super_admin boolean,
  p_city_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'private'
AS $$
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
        SELECT coalesce(sum(dsv.total_visits), 0)::int
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
$$;

REVOKE ALL ON FUNCTION private.get_staff_dashboard_payload(boolean, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_staff_dashboard_payload(boolean, bigint) TO authenticated, service_role;

-- =========================================================
-- User activity and suspension controls
-- =========================================================

CREATE OR REPLACE FUNCTION private.staff_user_activity_summary(
  p_inactive_days integer DEFAULT 180,
  p_city_id bigint DEFAULT NULL::bigint
)
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  city_id bigint,
  city_name text,
  state_name text,
  account_created_at timestamp with time zone,
  last_sign_in_at timestamp with time zone,
  last_seen_at timestamp with time zone,
  inactivity_days integer,
  is_inactive boolean,
  is_suspended boolean,
  guard_suspended_at timestamp with time zone,
  guard_suspension_reason text,
  shop_count integer,
  shops jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'private'
AS $$
DECLARE
  v_admin_role public.admin_role;
  v_is_super_admin boolean := false;
  v_scope_city_id bigint := NULL;
BEGIN
  IF NOT private.is_staff_member() THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  v_admin_role := private.get_admin_role();
  IF v_admin_role IS NULL THEN
    RAISE EXCEPTION 'Admin operation role required.' USING ERRCODE = '42501';
  END IF;

  v_is_super_admin := v_admin_role = 'super_admin'::public.admin_role;
  v_scope_city_id := CASE
    WHEN v_is_super_admin THEN p_city_id
    ELSE private.get_admin_city()
  END;

  IF NOT v_is_super_admin AND v_scope_city_id IS NULL THEN
    RAISE EXCEPTION 'Admin city scope is missing.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH shop_rollup AS (
    SELECT
      s.owner_id,
      count(*)::integer AS shop_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'shop_id', s.id,
            'shop_name', s.name,
            'unique_id', s.unique_id,
            'status', s.status,
            'is_open', s.is_open,
            'city_id', s.city_id
          )
          ORDER BY s.created_at DESC
        ) FILTER (WHERE s.id IS NOT NULL),
        '[]'::jsonb
      ) AS shops
    FROM public.shops s
    GROUP BY s.owner_id
  )
  SELECT
    u.id AS user_id,
    u.email::text AS email,
    p.full_name,
    p.city_id,
    c.name AS city_name,
    c.state AS state_name,
    u.created_at AS account_created_at,
    u.last_sign_in_at,
    coalesce(u.last_sign_in_at, u.created_at) AS last_seen_at,
    greatest(
      floor(
        extract(epoch FROM (now() - coalesce(u.last_sign_in_at, u.created_at))) / 86400
      )::integer,
      0
    ) AS inactivity_days,
    (
      coalesce(u.last_sign_in_at, u.created_at)
      <= now() - make_interval(days => greatest(coalesce(p_inactive_days, 180), 1))
    ) AS is_inactive,
    (coalesce(p.is_suspended, false) OR lsg.suspended_at IS NOT NULL) AS is_suspended,
    lsg.suspended_at AS guard_suspended_at,
    lsg.suspension_reason AS guard_suspension_reason,
    coalesce(sr.shop_count, 0) AS shop_count,
    coalesce(sr.shops, '[]'::jsonb) AS shops
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.cities c ON c.id = p.city_id
  LEFT JOIN shop_rollup sr ON sr.owner_id = u.id
  LEFT JOIN public.staff_profiles sp ON sp.id = u.id
  LEFT JOIN public.admins adm ON adm.id = u.id
  LEFT JOIN public.login_security_guards lsg ON lsg.email = lower(u.email)
  WHERE sp.id IS NULL
    AND u.email IS NOT NULL
    AND (v_scope_city_id IS NULL OR p.city_id = v_scope_city_id)
    AND (v_is_super_admin OR adm.role IS DISTINCT FROM 'super_admin'::public.admin_role)
  ORDER BY
    (
      coalesce(u.last_sign_in_at, u.created_at)
      <= now() - make_interval(days => greatest(coalesce(p_inactive_days, 180), 1))
    ) DESC,
    coalesce(u.last_sign_in_at, u.created_at) ASC,
    u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION private.staff_user_activity_summary(integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.staff_user_activity_summary(integer, bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.ctm_staff_update_user_status(
  p_user_id uuid,
  p_email text,
  p_suspend boolean,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'private'
AS $$
DECLARE
  v_normalized_email text := lower(trim(coalesce(p_email, '')));
  v_resolved_email text;
  v_actor_role public.admin_role;
  v_actor_city_id bigint;
  v_target_city_id bigint;
  v_target_admin_role public.admin_role;
BEGIN
  IF NOT private.is_staff_member() THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  v_actor_role := private.get_admin_role();
  v_actor_city_id := private.get_admin_city();

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Admin operation role required.' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required.' USING ERRCODE = '22023';
  END IF;

  SELECT p.city_id, a.role
  INTO v_target_city_id, v_target_admin_role
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.admins a ON a.id = u.id
  WHERE u.id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User could not be found.' USING ERRCODE = '22023';
  END IF;

  IF v_actor_role <> 'super_admin'::public.admin_role THEN
    IF v_actor_role <> 'city_admin'::public.admin_role THEN
      RAISE EXCEPTION 'Unsupported admin operation role.' USING ERRCODE = '42501';
    END IF;

    IF v_actor_city_id IS NULL THEN
      RAISE EXCEPTION 'Admin city scope is missing.' USING ERRCODE = '42501';
    END IF;

    IF v_target_admin_role = 'super_admin'::public.admin_role THEN
      RAISE EXCEPTION 'City admins cannot manage super admin accounts.' USING ERRCODE = '42501';
    END IF;

    IF v_target_city_id IS DISTINCT FROM v_actor_city_id THEN
      RAISE EXCEPTION 'City admins can only manage users in their city.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_normalized_email = '' THEN
    SELECT lower(u.email)
    INTO v_resolved_email
    FROM auth.users u
    WHERE u.id = p_user_id
    LIMIT 1;

    v_normalized_email := coalesce(v_resolved_email, '');
  END IF;

  IF v_normalized_email = '' THEN
    RAISE EXCEPTION 'User email could not be resolved.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET is_suspended = p_suspend
  WHERE id = p_user_id;

  IF p_suspend THEN
    INSERT INTO public.login_security_guards (
      email,
      user_id,
      failed_attempts,
      suspended_at,
      suspension_reason,
      updated_at
    )
    VALUES (
      v_normalized_email,
      p_user_id,
      3,
      now(),
      coalesce(nullif(trim(p_reason), ''), 'Manual staff suspension'),
      now()
    )
    ON CONFLICT (email) DO UPDATE
    SET
      user_id = coalesce(excluded.user_id, public.login_security_guards.user_id),
      failed_attempts = greatest(public.login_security_guards.failed_attempts, 3),
      suspended_at = now(),
      suspension_reason = coalesce(nullif(trim(p_reason), ''), 'Manual staff suspension'),
      updated_at = now();
  ELSE
    UPDATE public.login_security_guards
    SET
      failed_attempts = 0,
      suspended_at = NULL,
      suspension_reason = NULL,
      last_failed_at = NULL,
      last_success_at = now(),
      updated_at = now()
    WHERE email = v_normalized_email
       OR user_id = p_user_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.ctm_staff_update_user_status(uuid, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ctm_staff_update_user_status(uuid, text, boolean, text) TO authenticated, service_role;

-- =========================================================
-- Security radar is super-admin-only
-- =========================================================

CREATE OR REPLACE FUNCTION private.ctm_get_contact_security_radar(
  p_days integer DEFAULT 30,
  p_city_id bigint DEFAULT NULL
)
RETURNS TABLE (
  actor_key text,
  actor_name text,
  actor_email text,
  actor_phone text,
  actor_user_id uuid,
  total_contacts bigint,
  whatsapp_contacts bigint,
  phone_contacts bigint,
  distinct_shops bigint,
  latest_contact_at timestamp with time zone,
  primary_ip text,
  device_fingerprint text,
  risk_level text,
  shops jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_window_start timestamp with time zone := now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1) - 1);
  v_effective_city_id bigint := p_city_id;
BEGIN
  IF NOT private.ctm_has_super_staff_access() THEN
    RAISE EXCEPTION 'Super admin access required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped_contacts AS (
    SELECT
      e.*,
      s.name AS shop_name,
      s.unique_id,
      public.ctm_shop_analytics_actor_key(
        e.actor_user_id,
        e.actor_email,
        e.device_fingerprint,
        e.ip_address
      ) AS resolved_actor_key
    FROM public.shop_analytics_events e
    JOIN public.shops s ON s.id = e.shop_id
    WHERE e.created_at >= v_window_start
      AND e.event_type IN ('contact_whatsapp', 'contact_phone')
      AND COALESCE(e.contact_status, 'opened') = 'opened'
      AND (v_effective_city_id IS NULL OR s.city_id = v_effective_city_id)
  ),
  actor_rollup AS (
    SELECT
      sc.resolved_actor_key AS actor_key,
      (
        array_agg(sc.actor_user_id ORDER BY sc.created_at DESC NULLS LAST)
        FILTER (WHERE sc.actor_user_id IS NOT NULL)
      )[1] AS actor_user_id,
      max(NULLIF(sc.actor_name, '')) AS actor_name,
      max(NULLIF(sc.actor_email, '')) AS actor_email,
      max(NULLIF(sc.actor_phone, '')) AS actor_phone,
      max(NULLIF(sc.ip_address, '')) AS primary_ip,
      max(NULLIF(sc.device_fingerprint, '')) AS device_fingerprint,
      count(*)::bigint AS total_contacts,
      count(*) FILTER (WHERE sc.event_type = 'contact_whatsapp')::bigint AS whatsapp_contacts,
      count(*) FILTER (WHERE sc.event_type = 'contact_phone')::bigint AS phone_contacts,
      count(DISTINCT sc.shop_id)::bigint AS distinct_shops,
      max(sc.created_at) AS latest_contact_at
    FROM scoped_contacts sc
    GROUP BY sc.resolved_actor_key
  ),
  shop_breakdown AS (
    SELECT
      sc.resolved_actor_key AS actor_key,
      sc.shop_id,
      max(sc.shop_name) AS shop_name,
      max(sc.unique_id) AS unique_id,
      count(*)::bigint AS contacts,
      max(sc.created_at) AS latest_contact_at
    FROM scoped_contacts sc
    GROUP BY sc.resolved_actor_key, sc.shop_id
  )
  SELECT
    ar.actor_key,
    COALESCE(ar.actor_name, 'Guest visitor') AS actor_name,
    ar.actor_email,
    ar.actor_phone,
    ar.actor_user_id,
    ar.total_contacts,
    ar.whatsapp_contacts,
    ar.phone_contacts,
    ar.distinct_shops,
    ar.latest_contact_at,
    ar.primary_ip,
    ar.device_fingerprint,
    CASE
      WHEN ar.total_contacts >= 12 OR ar.distinct_shops >= 4 THEN 'critical'
      WHEN ar.total_contacts >= 8 OR ar.distinct_shops >= 3 THEN 'high'
      WHEN ar.total_contacts >= 4 OR ar.distinct_shops >= 2 THEN 'medium'
      ELSE 'low'
    END AS risk_level,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'shop_id', sb.shop_id,
          'shop_name', sb.shop_name,
          'unique_id', sb.unique_id,
          'contacts', sb.contacts,
          'latest_contact_at', sb.latest_contact_at
        )
        ORDER BY sb.contacts DESC, sb.latest_contact_at DESC
      )
      FROM shop_breakdown sb
      WHERE sb.actor_key = ar.actor_key
    ), '[]'::jsonb) AS shops
  FROM actor_rollup ar
  WHERE ar.total_contacts >= 3
  ORDER BY ar.total_contacts DESC, ar.latest_contact_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION private.ctm_get_security_radar_insights()
RETURNS TABLE(
  fingerprint_type text,
  fingerprint_value text,
  occurrence_count bigint,
  associated_emails text[],
  associated_shops text[],
  is_banned boolean,
  risk_level text,
  account_data jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF NOT private.ctm_has_super_staff_access() THEN
    RAISE EXCEPTION 'Super admin access required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH all_registrations AS (
    SELECT
      u.id AS user_id,
      u.email,
      p.creation_ip,
      p.creation_device,
      NULL::text AS shop_name,
      p.full_name
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (p.creation_ip IS NOT NULL AND p.creation_ip <> 'Unknown IP' AND length(p.creation_ip) > 6)
       OR (p.creation_device IS NOT NULL AND p.creation_device <> 'Unknown Device')

    UNION ALL

    SELECT
      u.id AS user_id,
      u.email,
      s.creation_ip,
      s.creation_device,
      s.name AS shop_name,
      NULL::text AS full_name
    FROM public.shops s
    LEFT JOIN auth.users u ON u.id = s.owner_id
    WHERE (s.creation_ip IS NOT NULL AND s.creation_ip <> 'Unknown IP' AND length(s.creation_ip) > 6)
       OR (s.creation_device IS NOT NULL AND s.creation_device <> 'Unknown Device')
  ),
  ip_clusters AS (
    SELECT
      'IP Address'::text AS f_type,
      creation_ip AS f_value,
      count(*)::bigint AS occurrences,
      array_agg(DISTINCT COALESCE(email, 'No Email'))::text[] AS emails,
      array_agg(DISTINCT shop_name) FILTER (WHERE shop_name IS NOT NULL)::text[] AS shops,
      jsonb_agg(DISTINCT jsonb_build_object(
        'email', COALESCE(email, 'No Email'),
        'name', COALESCE(full_name, 'Unknown'),
        'shops', (SELECT jsonb_agg(name) FROM public.shops WHERE owner_id = all_registrations.user_id)
      )) AS data_payload
    FROM all_registrations
    WHERE creation_ip IS NOT NULL AND creation_ip <> 'Unknown IP'
    GROUP BY creation_ip
    HAVING count(*) > 1
  ),
  device_clusters AS (
    SELECT
      'Device Signature'::text AS f_type,
      creation_device AS f_value,
      count(*)::bigint AS occurrences,
      array_agg(DISTINCT COALESCE(email, 'No Email'))::text[] AS emails,
      array_agg(DISTINCT shop_name) FILTER (WHERE shop_name IS NOT NULL)::text[] AS shops,
      jsonb_agg(DISTINCT jsonb_build_object(
        'email', COALESCE(email, 'No Email'),
        'name', COALESCE(full_name, 'Unknown'),
        'ip', creation_ip,
        'shops', (SELECT jsonb_agg(name) FROM public.shops WHERE owner_id = all_registrations.user_id)
      )) AS data_payload
    FROM all_registrations
    WHERE creation_device IS NOT NULL AND creation_device <> 'Unknown Device'
    GROUP BY creation_device
    HAVING count(*) > 1
  ),
  combined AS (
    SELECT * FROM ip_clusters
    UNION ALL
    SELECT * FROM device_clusters
  )
  SELECT
    c.f_type,
    c.f_value,
    c.occurrences,
    c.emails,
    c.shops,
    EXISTS (SELECT 1 FROM public.ip_blacklist bl WHERE bl.ip_address = c.f_value) AS is_banned,
    CASE
      WHEN c.occurrences >= 5 THEN 'CRITICAL'
      WHEN c.occurrences >= 3 THEN 'HIGH'
      ELSE 'MEDIUM'
    END AS risk_level,
    c.data_payload AS account_data
  FROM combined c
  ORDER BY c.occurrences DESC;
END;
$$;

REVOKE ALL ON FUNCTION private.ctm_get_contact_security_radar(integer, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_get_security_radar_insights() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ctm_get_contact_security_radar(integer, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_get_security_radar_insights() TO authenticated, service_role;

-- Staff-only users can enter the portal, but operational analytics require
-- an admin role attached to that staff account.
CREATE OR REPLACE FUNCTION private.staff_site_visit_daily(p_days integer DEFAULT 30)
RETURNS TABLE(
  visit_date date,
  total_visits bigint,
  unique_visitors bigint,
  authenticated_visits bigint,
  total_sessions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF NOT private.ctm_has_staff_access() THEN
    RAISE EXCEPTION 'Admin operation role required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    dsv.visit_date,
    dsv.total_visits,
    0::bigint AS unique_visitors,
    dsv.authenticated_visits,
    0::bigint AS total_sessions
  FROM public.daily_site_visits dsv
  WHERE dsv.visit_date >= (timezone('Africa/Lagos', now()))::date
    - make_interval(days => greatest(coalesce(p_days, 30), 1) - 1)
  ORDER BY dsv.visit_date ASC;
END;
$$;

CREATE OR REPLACE FUNCTION private.staff_site_visit_top_pages(
  p_days integer DEFAULT 30,
  p_limit integer DEFAULT 8
)
RETURNS TABLE(
  page_path text,
  total_visits bigint,
  unique_visitors bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF NOT private.ctm_has_staff_access() THEN
    RAISE EXCEPTION 'Admin operation role required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT NULL::text, 0::bigint, 0::bigint
  FROM (SELECT greatest(coalesce(p_days, 30), 1) AS days_window) args
  WHERE args.days_window IS NULL
  LIMIT greatest(coalesce(p_limit, 8), 1);
END;
$$;

CREATE OR REPLACE FUNCTION private.ctm_reinstate_login_guard(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF NOT private.ctm_has_staff_access() THEN
    RAISE EXCEPTION 'Admin operation role required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.login_security_guards
  SET
    failed_attempts = 0,
    suspended_at = NULL,
    suspension_reason = NULL,
    updated_at = now()
  WHERE email = lower(trim(p_email));

  RETURN found;
END;
$$;

CREATE OR REPLACE FUNCTION private.stamp_profile_footprint(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_headers json;
  v_net json;
  v_user_agent text;
BEGIN
  IF p_target_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF (SELECT auth.uid()) IS NOT NULL
     AND (SELECT auth.uid()) <> p_target_user_id
     AND NOT private.ctm_has_staff_access()
  THEN
    RETURN false;
  END IF;

  BEGIN
    v_net := public.get_network_info();
  EXCEPTION WHEN OTHERS THEN
    v_net := '{}'::json;
  END;

  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    SELECT value
    INTO v_user_agent
    FROM json_each_text(v_headers)
    WHERE lower(key) = 'user-agent'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_user_agent := NULL;
  END;

  UPDATE public.profiles
  SET
    creation_ip = CASE
      WHEN creation_ip IS NULL OR creation_ip = 'Unknown IP' OR length(trim(creation_ip)) < 7
        THEN nullif(v_net->>'ip', '')
      ELSE creation_ip
    END,
    ip_country = CASE
      WHEN ip_country IS NULL OR ip_country = 'Unknown'
        THEN nullif(v_net->>'country', '')
      ELSE ip_country
    END,
    creation_device = CASE
      WHEN creation_device IS NULL OR creation_device = 'Unknown Device'
        THEN coalesce(nullif(v_user_agent, ''), creation_device)
      ELSE creation_device
    END
  WHERE id = p_target_user_id;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.staff_site_visit_daily(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.staff_site_visit_top_pages(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_reinstate_login_guard(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.stamp_profile_footprint(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.staff_site_visit_daily(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.staff_site_visit_top_pages(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_reinstate_login_guard(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.stamp_profile_footprint(uuid) TO authenticated, service_role;

-- =========================================================
-- Shop KYC trigger: review means approve or reject
-- =========================================================

CREATE OR REPLACE FUNCTION public.protect_shop_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF public.get_admin_role() IS NULL THEN
    NEW.status := OLD.status;
    NEW.is_verified := OLD.is_verified;
    NEW.is_featured := OLD.is_featured;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.is_open := OLD.is_open;
    NEW.unique_id := OLD.unique_id;

    IF NEW.kyc_status IN ('approved', 'rejected')
      AND OLD.kyc_status IS DISTINCT FROM NEW.kyc_status
    THEN
      RAISE EXCEPTION 'Unauthorized: merchants cannot approve or reject their own KYC.';
    END IF;
  END IF;

  IF public.get_admin_role()::text IS DISTINCT FROM 'super_admin' THEN
    NEW.is_verified := OLD.is_verified;

    IF OLD.kyc_status IS DISTINCT FROM NEW.kyc_status
      AND NEW.kyc_status IN ('approved', 'rejected')
    THEN
      RAISE EXCEPTION 'Unauthorized: only super admins can review shop KYC.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_shop_admin_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_shop_admin_columns() TO service_role;

-- =========================================================
-- Payment review transaction: service role plus super-admin staff id
-- =========================================================

CREATE OR REPLACE FUNCTION public.process_offline_payment_review(
  p_proof_id bigint,
  p_staff_id uuid,
  p_action text,
  p_note text,
  p_payment_ref text DEFAULT NULL::text,
  p_amount numeric DEFAULT NULL::numeric,
  p_plan_key text DEFAULT NULL::text,
  p_new_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_merchant_name text DEFAULT NULL::text,
  p_shop_name text DEFAULT NULL::text,
  p_city_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_proof record;
  v_existing_physical record;
  v_final_ref text;
  v_shop_name text := coalesce(nullif(trim(p_shop_name), ''), 'your shop');
  v_plan_label text := CASE p_plan_key
    WHEN '6_Months' THEN '6-month service plan'
    WHEN '1_Year' THEN '1-year service plan'
    ELSE 'service plan'
  END;
  v_end_date_label text := CASE
    WHEN p_new_end_date IS NOT NULL THEN to_char(p_new_end_date AT TIME ZONE 'Africa/Lagos', 'DD Mon YYYY')
    ELSE NULL
  END;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff_profiles sp
    JOIN public.admins a ON a.id = sp.id
    WHERE sp.id = p_staff_id
      AND a.role = 'super_admin'::public.admin_role
  ) THEN
    RAISE EXCEPTION 'Super admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_proof
  FROM public.offline_payment_proofs
  WHERE id = p_proof_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment proof not found.';
  END IF;

  IF v_proof.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'status', v_proof.status,
      'message', 'Payment proof is already ' || v_proof.status
    );
  END IF;

  IF p_action = 'reject' THEN
    UPDATE public.offline_payment_proofs
    SET status = 'rejected',
        review_note = p_note,
        reviewed_by = p_staff_id,
        reviewed_at = now()
    WHERE id = p_proof_id;

    IF v_proof.payment_kind = 'physical_verification' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Verification Receipt Needs Attention',
        'We could not confirm your physical verification payment for "' || v_shop_name || '".'
        || CASE
            WHEN nullif(trim(coalesce(p_note, '')), '') IS NOT NULL THEN ' Staff note: ' || trim(p_note) || '.'
            ELSE ''
           END
        || ' Please upload a clearer receipt or contact support if the transfer has already reached us.',
        'verification_payment_rejected',
        '/remita?shop_id=' || v_proof.shop_id::text
      );
    ELSIF v_proof.payment_kind = 'service_fee' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Service Fee Receipt Needs Attention',
        'We could not confirm the service fee payment for "' || v_shop_name || '".'
        || CASE
            WHEN nullif(trim(coalesce(p_note, '')), '') IS NOT NULL THEN ' Staff note: ' || trim(p_note) || '.'
            ELSE ''
           END
        || ' Please upload a clearer receipt or contact support if payment has already been made.',
        'service_fee_rejected',
        '/service-fee?shop_id=' || v_proof.shop_id::text
      );
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'message', 'Payment proof rejected.');
  END IF;

  IF p_action = 'approve' THEN
    v_final_ref := p_payment_ref;

    IF v_proof.payment_kind = 'physical_verification' THEN
      SELECT * INTO v_existing_physical
      FROM public.physical_verification_payments
      WHERE merchant_id = v_proof.merchant_id AND status = 'success'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.physical_verification_payments (
          merchant_id, merchant_name, shop_name, city, amount, payment_ref, status
        ) VALUES (
          v_proof.merchant_id, p_merchant_name, p_shop_name, p_city_name, p_amount, v_final_ref, 'success'
        );
      ELSE
        v_final_ref := coalesce(nullif(trim(coalesce(v_existing_physical.payment_ref, '')), ''), v_final_ref);
      END IF;

    ELSIF v_proof.payment_kind = 'service_fee' THEN
      UPDATE public.shops
      SET subscription_plan = p_plan_key,
          subscription_end_date = p_new_end_date
      WHERE id = v_proof.shop_id AND owner_id = v_proof.merchant_id;

      INSERT INTO public.service_fee_payments (
        merchant_id, shop_id, amount, plan, payment_ref, status
      ) VALUES (
        v_proof.merchant_id, v_proof.shop_id, p_amount, p_plan_key, v_final_ref, 'success'
      );
    ELSE
      RAISE EXCEPTION 'Unknown payment kind: %', v_proof.payment_kind;
    END IF;

    UPDATE public.offline_payment_proofs
    SET status = 'approved',
        review_note = COALESCE(p_note, 'Payment confirmed by staff.'),
        reviewed_by = p_staff_id,
        reviewed_at = now(),
        approval_payment_ref = v_final_ref
    WHERE id = p_proof_id;

    IF v_proof.payment_kind = 'physical_verification' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Verification Fee Confirmed',
        'We have confirmed your physical verification payment for "' || v_shop_name || '". You can now continue to video KYC.',
        'verification_payment_confirmed',
        '/merchant-video-kyc?shop_id=' || v_proof.shop_id::text
      );
    ELSIF v_proof.payment_kind = 'service_fee' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Service Fee Confirmed',
        '"' || v_shop_name || '" is now on the ' || v_plan_label
        || CASE
            WHEN v_end_date_label IS NOT NULL THEN ' and remains active until ' || v_end_date_label || '.'
            ELSE '.'
           END,
        'service_fee_confirmed',
        '/vendor-panel'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'approved',
      'paymentRef', v_final_ref,
      'plan', p_plan_key,
      'subscriptionEndDate', p_new_end_date,
      'message', 'Payment proof approved successfully.'
    );
  END IF;

  RAISE EXCEPTION 'Invalid action parameter.';
END;
$$;

REVOKE ALL ON FUNCTION public.process_offline_payment_review(
  bigint,
  uuid,
  text,
  text,
  text,
  numeric,
  text,
  timestamp with time zone,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_offline_payment_review(
  bigint,
  uuid,
  text,
  text,
  text,
  numeric,
  text,
  timestamp with time zone,
  text,
  text,
  text
) TO service_role;

-- =========================================================
-- RLS: payment data and staff-created content
-- =========================================================

DROP POLICY IF EXISTS "CTM payment proofs read" ON public.offline_payment_proofs;
CREATE POLICY "CTM payment proofs read"
ON public.offline_payment_proofs
FOR SELECT
TO authenticated
USING (
  merchant_id = (SELECT auth.uid())
  OR public.ctm_has_super_staff_access()
);

DROP POLICY IF EXISTS "Users can view physical verification payments" ON public.physical_verification_payments;
CREATE POLICY "Users can view physical verification payments"
ON public.physical_verification_payments
FOR SELECT
TO authenticated
USING (
  merchant_id = (SELECT auth.uid())
  OR public.ctm_has_super_staff_access()
);

DROP POLICY IF EXISTS "Users can view service fee payments" ON public.service_fee_payments;
CREATE POLICY "Users can view service fee payments"
ON public.service_fee_payments
FOR SELECT
TO authenticated
USING (
  merchant_id = (SELECT auth.uid())
  OR public.ctm_has_super_staff_access()
);

DROP POLICY IF EXISTS "CTM discoveries delete" ON public.staff_discoveries;
DROP POLICY IF EXISTS "CTM discoveries insert" ON public.staff_discoveries;
DROP POLICY IF EXISTS "CTM discoveries read" ON public.staff_discoveries;
DROP POLICY IF EXISTS "CTM discoveries update" ON public.staff_discoveries;

CREATE POLICY "CTM discoveries delete"
ON public.staff_discoveries
FOR DELETE
TO authenticated
USING (public.ctm_has_staff_access());

CREATE POLICY "CTM discoveries insert"
ON public.staff_discoveries
FOR INSERT
TO authenticated
WITH CHECK (public.ctm_has_staff_access());

CREATE POLICY "CTM discoveries read"
ON public.staff_discoveries
FOR SELECT
TO public
USING (
  status = 'published'
  OR public.ctm_has_staff_access()
);

CREATE POLICY "CTM discoveries update"
ON public.staff_discoveries
FOR UPDATE
TO authenticated
USING (public.ctm_has_staff_access())
WITH CHECK (public.ctm_has_staff_access());

-- =========================================================
-- Storage: staff-only is not enough for sensitive assets
-- =========================================================

DROP POLICY IF EXISTS "CTM private asset read" ON storage.objects;
DROP POLICY IF EXISTS "CTM private asset insert" ON storage.objects;
DROP POLICY IF EXISTS "CTM private asset update" ON storage.objects;
DROP POLICY IF EXISTS "CTM private asset delete" ON storage.objects;

CREATE POLICY "CTM private asset read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  (
    bucket_id IN ('id-documents', 'cac-documents')
    AND (
      public.ctm_has_staff_access()
      OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    )
  )
  OR (
    bucket_id IN ('kyc_videos', 'kyc-videos', 'payment-receipts')
    AND (
      public.ctm_has_super_staff_access()
      OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    )
  )
);

CREATE POLICY "CTM private asset insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  (
    bucket_id IN ('id-documents', 'cac-documents')
    AND (
      public.ctm_has_staff_access()
      OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    )
  )
  OR (
    bucket_id IN ('kyc_videos', 'kyc-videos', 'payment-receipts')
    AND (
      public.ctm_has_super_staff_access()
      OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    )
  )
);

CREATE POLICY "CTM private asset update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  (
    bucket_id IN ('id-documents', 'cac-documents')
    AND (
      public.ctm_has_staff_access()
      OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    )
  )
  OR (
    bucket_id IN ('kyc_videos', 'kyc-videos', 'payment-receipts')
    AND (
      public.ctm_has_super_staff_access()
      OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    )
  )
)
WITH CHECK (
  (
    bucket_id IN ('id-documents', 'cac-documents')
    AND (
      public.ctm_has_staff_access()
      OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    )
  )
  OR (
    bucket_id IN ('kyc_videos', 'kyc-videos', 'payment-receipts')
    AND (
      public.ctm_has_super_staff_access()
      OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    )
  )
);

CREATE POLICY "CTM private asset delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  (
    bucket_id IN ('id-documents', 'cac-documents')
    AND (
      public.ctm_has_staff_access()
      OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    )
  )
  OR (
    bucket_id IN ('kyc_videos', 'kyc-videos', 'payment-receipts')
    AND (
      public.ctm_has_super_staff_access()
      OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    )
  )
);

DROP POLICY IF EXISTS "CTM public asset insert" ON storage.objects;
DROP POLICY IF EXISTS "CTM public asset update" ON storage.objects;
DROP POLICY IF EXISTS "CTM public asset delete" ON storage.objects;

CREATE POLICY "CTM public asset insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN (
    'avatars',
    'products',
    'storefronts',
    'brand-assets',
    'sponsored-products',
    'featured-city-banners',
    'shops-banner-storage'
  )
  AND (
    public.ctm_has_staff_access()
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
);

CREATE POLICY "CTM public asset update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN (
    'avatars',
    'products',
    'storefronts',
    'brand-assets',
    'sponsored-products',
    'featured-city-banners',
    'shops-banner-storage'
  )
  AND (
    public.ctm_has_staff_access()
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
)
WITH CHECK (
  bucket_id IN (
    'avatars',
    'products',
    'storefronts',
    'brand-assets',
    'sponsored-products',
    'featured-city-banners',
    'shops-banner-storage'
  )
  AND (
    public.ctm_has_staff_access()
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
);

CREATE POLICY "CTM public asset delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN (
    'avatars',
    'products',
    'storefronts',
    'brand-assets',
    'sponsored-products',
    'featured-city-banners',
    'shops-banner-storage'
  )
  AND (
    public.ctm_has_staff_access()
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
);
