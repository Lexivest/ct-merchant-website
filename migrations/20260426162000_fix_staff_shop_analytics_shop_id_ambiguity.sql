CREATE OR REPLACE FUNCTION public.ctm_get_staff_shop_analytics(
  p_days integer DEFAULT 30,
  p_city_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  shop_id bigint,
  shop_name text,
  unique_id text,
  city_name text,
  owner_name text,
  total_views bigint,
  repo_search_views bigint,
  total_contacts bigint,
  whatsapp_contacts bigint,
  phone_contacts bigint,
  conversion_rate numeric,
  latest_contact_at timestamp with time zone,
  suspicious_actor_count bigint,
  risk_level text
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
  WITH scoped_events AS (
    SELECT
      e.*,
      public.ctm_shop_analytics_actor_key(
        e.actor_user_id,
        e.actor_email,
        e.device_fingerprint,
        e.ip_address
      ) AS actor_key
    FROM public.shop_analytics_events e
    JOIN public.shops s ON s.id = e.shop_id
    WHERE e.created_at >= v_window_start
      AND (v_effective_city_id IS NULL OR s.city_id = v_effective_city_id)
  ),
  actor_risk AS (
    SELECT
      se.shop_id AS shop_id,
      se.actor_key,
      count(*) FILTER (
        WHERE se.event_type IN ('contact_whatsapp', 'contact_phone')
          AND COALESCE(se.contact_status, 'opened') = 'opened'
      )::bigint AS total_contacts
    FROM scoped_events se
    GROUP BY se.shop_id, se.actor_key
  ),
  suspicious_counts AS (
    SELECT
      ar.shop_id AS shop_id,
      count(*) FILTER (WHERE ar.total_contacts >= 3)::bigint AS suspicious_actor_count
    FROM actor_risk ar
    GROUP BY ar.shop_id
  ),
  shop_totals AS (
    SELECT
      s.id AS shop_id,
      s.name AS shop_name,
      s.unique_id,
      c.name AS city_name,
      owner.full_name AS owner_name,
      count(*) FILTER (WHERE e.event_type = 'shop_view')::bigint AS total_views,
      count(*) FILTER (WHERE e.event_type = 'shop_view' AND e.event_source = 'repo_search')::bigint AS repo_search_views,
      count(*) FILTER (
        WHERE e.event_type IN ('contact_whatsapp', 'contact_phone')
          AND COALESCE(e.contact_status, 'opened') = 'opened'
      )::bigint AS total_contacts,
      count(*) FILTER (
        WHERE e.event_type = 'contact_whatsapp'
          AND COALESCE(e.contact_status, 'opened') = 'opened'
      )::bigint AS whatsapp_contacts,
      count(*) FILTER (
        WHERE e.event_type = 'contact_phone'
          AND COALESCE(e.contact_status, 'opened') = 'opened'
      )::bigint AS phone_contacts,
      max(e.created_at) FILTER (
        WHERE e.event_type IN ('contact_whatsapp', 'contact_phone')
          AND COALESCE(e.contact_status, 'opened') = 'opened'
      ) AS latest_contact_at
    FROM public.shops s
    LEFT JOIN public.cities c ON c.id = s.city_id
    LEFT JOIN public.profiles owner ON owner.id = s.owner_id
    LEFT JOIN scoped_events e ON e.shop_id = s.id
    WHERE v_effective_city_id IS NULL OR s.city_id = v_effective_city_id
    GROUP BY s.id, s.name, s.unique_id, c.name, owner.full_name
  )
  SELECT
    st.shop_id,
    st.shop_name,
    st.unique_id,
    st.city_name,
    st.owner_name,
    st.total_views,
    st.repo_search_views,
    st.total_contacts,
    st.whatsapp_contacts,
    st.phone_contacts,
    CASE
      WHEN st.total_views > 0
        THEN round((st.total_contacts::numeric / st.total_views::numeric) * 100, 1)
      ELSE 0
    END AS conversion_rate,
    st.latest_contact_at,
    COALESCE(sc.suspicious_actor_count, 0)::bigint AS suspicious_actor_count,
    CASE
      WHEN COALESCE(sc.suspicious_actor_count, 0) >= 3 OR st.total_contacts >= 20 THEN 'critical'
      WHEN COALESCE(sc.suspicious_actor_count, 0) >= 1 OR st.total_contacts >= 10 THEN 'high'
      WHEN st.total_contacts >= 5 OR st.total_views >= 20 THEN 'medium'
      ELSE 'low'
    END AS risk_level
  FROM shop_totals st
  LEFT JOIN suspicious_counts sc ON sc.shop_id = st.shop_id
  WHERE st.total_views > 0 OR st.total_contacts > 0
  ORDER BY st.total_contacts DESC, st.total_views DESC, st.shop_name ASC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
END;
$$;
