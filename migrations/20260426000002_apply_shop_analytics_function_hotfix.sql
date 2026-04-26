-- Apply analytics function hotfixes with a fresh migration name so Supabase
-- will push the corrected function bodies even if earlier migration files were
-- already marked as applied remotely.

CREATE OR REPLACE FUNCTION public.ctm_get_shop_analytics_summary(
  p_shop_id bigint,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_days, 30), 1);
  v_window_start timestamp with time zone := now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1) - 1);
  v_has_access boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = p_shop_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR (SELECT public.ctm_has_super_staff_access())
        OR (
          (SELECT public.ctm_has_staff_access())
          AND s.city_id = (SELECT public.ctm_current_staff_city_scope())
        )
      )
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH shop_meta AS (
      SELECT
        s.id,
        s.name,
        s.unique_id,
        s.city_id,
        c.name AS city_name
      FROM public.shops s
      LEFT JOIN public.cities c ON c.id = s.city_id
      WHERE s.id = p_shop_id
    ),
    scoped_events AS (
      SELECT
        e.*,
        timezone('Africa/Lagos', e.created_at)::date AS event_date,
        public.ctm_shop_analytics_actor_key(
          e.actor_user_id,
          e.actor_email,
          e.device_fingerprint,
          e.ip_address
        ) AS actor_key
      FROM public.shop_analytics_events e
      WHERE e.shop_id = p_shop_id
        AND e.created_at >= v_window_start
    ),
    opened_contacts AS (
      SELECT *
      FROM scoped_events se
      WHERE se.event_type IN ('contact_whatsapp', 'contact_phone')
        AND COALESCE(se.contact_status, 'opened') = 'opened'
    ),
    daily_rollup AS (
      SELECT
        gs::date AS event_date,
        COALESCE(count(*) FILTER (WHERE se.event_type = 'shop_view'), 0)::bigint AS views,
        COALESCE(count(*) FILTER (WHERE se.event_type = 'shop_view' AND se.event_source = 'repo_search'), 0)::bigint AS repo_search_views,
        COALESCE(count(*) FILTER (WHERE se.event_type IN ('contact_whatsapp', 'contact_phone') AND COALESCE(se.contact_status, 'opened') = 'opened'), 0)::bigint AS contacts,
        COALESCE(count(*) FILTER (WHERE se.event_type = 'contact_whatsapp' AND COALESCE(se.contact_status, 'opened') = 'opened'), 0)::bigint AS whatsapp_contacts,
        COALESCE(count(*) FILTER (WHERE se.event_type = 'contact_phone' AND COALESCE(se.contact_status, 'opened') = 'opened'), 0)::bigint AS phone_contacts
      FROM generate_series(
        timezone('Africa/Lagos', v_window_start)::date,
        timezone('Africa/Lagos', now())::date,
        INTERVAL '1 day'
      ) AS gs
      LEFT JOIN scoped_events se ON se.event_date = gs::date
      GROUP BY gs
      ORDER BY gs
    ),
    actor_rollup AS (
      SELECT
        oc.actor_key,
        (
          array_agg(oc.actor_user_id ORDER BY oc.created_at DESC NULLS LAST)
          FILTER (WHERE oc.actor_user_id IS NOT NULL)
        )[1] AS actor_user_id,
        max(NULLIF(oc.actor_name, '')) AS actor_name,
        max(NULLIF(oc.actor_email, '')) AS actor_email,
        max(NULLIF(oc.actor_phone, '')) AS actor_phone,
        max(NULLIF(oc.ip_address, '')) AS ip_address,
        max(NULLIF(oc.device_fingerprint, '')) AS device_fingerprint,
        count(*)::bigint AS total_contacts,
        count(*) FILTER (WHERE oc.event_type = 'contact_whatsapp')::bigint AS whatsapp_contacts,
        count(*) FILTER (WHERE oc.event_type = 'contact_phone')::bigint AS phone_contacts,
        max(oc.created_at) AS latest_contact_at,
        count(DISTINCT oc.product_id)::bigint AS distinct_products,
        CASE
          WHEN count(*) >= 8 THEN 'critical'
          WHEN count(*) >= 5 THEN 'high'
          WHEN count(*) >= 3 THEN 'medium'
          ELSE 'low'
        END AS risk_level
      FROM opened_contacts oc
      GROUP BY oc.actor_key
    ),
    contact_feed_rollup AS (
      SELECT DISTINCT ON (oc.actor_key)
        oc.actor_key,
        oc.id,
        oc.event_type,
        oc.event_source,
        oc.product_id,
        oc.created_at,
        NULLIF(oc.ip_address, '') AS ip_address,
        NULLIF(oc.device_fingerprint, '') AS device_fingerprint
      FROM opened_contacts oc
      ORDER BY oc.actor_key, oc.created_at DESC, oc.id DESC
    ),
    totals AS (
      SELECT
        count(*) FILTER (WHERE se.event_type = 'shop_view')::bigint AS total_views,
        count(*) FILTER (WHERE se.event_type = 'shop_view' AND se.event_source = 'repo_search')::bigint AS repo_search_views,
        count(*) FILTER (WHERE se.event_type IN ('contact_whatsapp', 'contact_phone') AND COALESCE(se.contact_status, 'opened') = 'opened')::bigint AS total_contacts,
        count(*) FILTER (WHERE se.event_type = 'contact_whatsapp' AND COALESCE(se.contact_status, 'opened') = 'opened')::bigint AS whatsapp_contacts,
        count(*) FILTER (WHERE se.event_type = 'contact_phone' AND COALESCE(se.contact_status, 'opened') = 'opened')::bigint AS phone_contacts,
        count(DISTINCT se.actor_key) FILTER (
          WHERE se.event_type IN ('contact_whatsapp', 'contact_phone')
            AND COALESCE(se.contact_status, 'opened') = 'opened'
        )::bigint AS unique_contact_actors
      FROM scoped_events se
    )
    SELECT jsonb_build_object(
      'shop', (
        SELECT jsonb_build_object(
          'id', sm.id,
          'name', sm.name,
          'unique_id', sm.unique_id,
          'city_name', sm.city_name
        )
        FROM shop_meta sm
      ),
      'window_days', v_days,
      'totals', (
        SELECT jsonb_build_object(
          'views', t.total_views,
          'repo_search_views', t.repo_search_views,
          'contacts', t.total_contacts,
          'whatsapp_contacts', t.whatsapp_contacts,
          'phone_contacts', t.phone_contacts,
          'unique_contact_actors', t.unique_contact_actors,
          'conversion_rate',
            CASE
              WHEN t.total_views > 0
                THEN round((t.total_contacts::numeric / t.total_views::numeric) * 100, 1)
              ELSE 0
            END
        )
        FROM totals t
      ),
      'timeline', (
        SELECT COALESCE(jsonb_agg(row_to_json(dr) ORDER BY dr.event_date), '[]'::jsonb)
        FROM daily_rollup dr
      ),
      'recent_contacts', (
        SELECT COALESCE(jsonb_agg(row_to_json(contact_row) ORDER BY contact_row.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT
            cfr.id::bigint AS id,
            COALESCE(ar.actor_name, 'Guest visitor') AS actor_name,
            ar.actor_email,
            ar.actor_phone,
            ar.actor_user_id,
            cfr.event_type,
            cfr.event_source,
            'opened'::text AS contact_status,
            cfr.created_at,
            cfr.ip_address,
            cfr.device_fingerprint,
            p.name AS product_name,
            ar.total_contacts AS actor_contact_count,
            ar.risk_level
          FROM contact_feed_rollup cfr
          LEFT JOIN public.products p ON p.id = cfr.product_id
          LEFT JOIN actor_rollup ar ON ar.actor_key = cfr.actor_key
          ORDER BY cfr.created_at DESC
          LIMIT 40
        ) AS contact_row
      ),
      'suspicious_contacts', (
        SELECT COALESCE(jsonb_agg(row_to_json(actor_row) ORDER BY actor_row.total_contacts DESC, actor_row.latest_contact_at DESC), '[]'::jsonb)
        FROM (
          SELECT
            ar.actor_key,
            COALESCE(ar.actor_name, 'Guest visitor') AS actor_name,
            ar.actor_email,
            ar.actor_phone,
            ar.actor_user_id,
            ar.ip_address,
            ar.device_fingerprint,
            ar.total_contacts,
            ar.whatsapp_contacts,
            ar.phone_contacts,
            ar.distinct_products,
            ar.latest_contact_at,
            ar.risk_level
          FROM actor_rollup ar
          WHERE ar.total_contacts >= 3
        ) AS actor_row
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ctm_get_shop_analytics_summary(bigint, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.ctm_get_contact_security_radar(
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
SET search_path TO 'public'
AS $$
DECLARE
  v_window_start timestamp with time zone := now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1) - 1);
  v_effective_city_id bigint := NULL;
BEGIN
  IF NOT (SELECT public.ctm_has_staff_access()) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  IF (SELECT public.ctm_has_super_staff_access()) THEN
    v_effective_city_id := p_city_id;
  ELSE
    v_effective_city_id := (SELECT public.ctm_current_staff_city_scope());
    IF v_effective_city_id IS NULL THEN
      RAISE EXCEPTION 'Staff city scope is missing.' USING ERRCODE = '42501';
    END IF;
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

GRANT EXECUTE ON FUNCTION public.ctm_get_contact_security_radar(integer, bigint) TO authenticated;
