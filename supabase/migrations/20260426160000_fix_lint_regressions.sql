-- Fix schema lint regressions after local restore and partial remote drift.
-- This migration refreshes the active function bodies on the remote database
-- without editing already-applied historical migrations.

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
      FROM scoped_events
      WHERE event_type IN ('contact_whatsapp', 'contact_phone')
        AND COALESCE(contact_status, 'opened') = 'opened'
    ),
    daily_rollup AS (
      SELECT
        gs::date AS event_date,
        COALESCE(count(*) FILTER (WHERE e.event_type = 'shop_view'), 0)::bigint AS views,
        COALESCE(count(*) FILTER (WHERE e.event_type = 'shop_view' AND e.event_source = 'repo_search'), 0)::bigint AS repo_search_views,
        COALESCE(count(*) FILTER (WHERE e.event_type IN ('contact_whatsapp', 'contact_phone') AND COALESCE(e.contact_status, 'opened') = 'opened'), 0)::bigint AS contacts,
        COALESCE(count(*) FILTER (WHERE e.event_type = 'contact_whatsapp' AND COALESCE(e.contact_status, 'opened') = 'opened'), 0)::bigint AS whatsapp_contacts,
        COALESCE(count(*) FILTER (WHERE e.event_type = 'contact_phone' AND COALESCE(e.contact_status, 'opened') = 'opened'), 0)::bigint AS phone_contacts
      FROM generate_series(
        timezone('Africa/Lagos', v_window_start)::date,
        timezone('Africa/Lagos', now())::date,
        INTERVAL '1 day'
      ) AS gs
      LEFT JOIN scoped_events e ON e.event_date = gs::date
      GROUP BY gs
      ORDER BY gs
    ),
    actor_rollup AS (
      SELECT
        actor_key,
        (
          array_agg(actor_user_id ORDER BY created_at DESC NULLS LAST)
          FILTER (WHERE actor_user_id IS NOT NULL)
        )[1] AS actor_user_id,
        max(NULLIF(actor_name, '')) AS actor_name,
        max(NULLIF(actor_email, '')) AS actor_email,
        max(NULLIF(actor_phone, '')) AS actor_phone,
        max(NULLIF(ip_address, '')) AS ip_address,
        max(NULLIF(device_fingerprint, '')) AS device_fingerprint,
        count(*)::bigint AS total_contacts,
        count(*) FILTER (WHERE event_type = 'contact_whatsapp')::bigint AS whatsapp_contacts,
        count(*) FILTER (WHERE event_type = 'contact_phone')::bigint AS phone_contacts,
        max(created_at) AS latest_contact_at,
        count(DISTINCT product_id)::bigint AS distinct_products,
        CASE
          WHEN count(*) >= 8 THEN 'critical'
          WHEN count(*) >= 5 THEN 'high'
          WHEN count(*) >= 3 THEN 'medium'
          ELSE 'low'
        END AS risk_level
      FROM opened_contacts
      GROUP BY actor_key
    ),
    contact_feed_rollup AS (
      SELECT DISTINCT ON (e.actor_key)
        e.actor_key,
        e.id,
        e.event_type,
        e.event_source,
        e.product_id,
        e.created_at,
        NULLIF(e.ip_address, '') AS ip_address,
        NULLIF(e.device_fingerprint, '') AS device_fingerprint
      FROM opened_contacts e
      ORDER BY e.actor_key, e.created_at DESC, e.id DESC
    ),
    totals AS (
      SELECT
        count(*) FILTER (WHERE event_type = 'shop_view')::bigint AS total_views,
        count(*) FILTER (WHERE event_type = 'shop_view' AND event_source = 'repo_search')::bigint AS repo_search_views,
        count(*) FILTER (WHERE event_type IN ('contact_whatsapp', 'contact_phone') AND COALESCE(contact_status, 'opened') = 'opened')::bigint AS total_contacts,
        count(*) FILTER (WHERE event_type = 'contact_whatsapp' AND COALESCE(contact_status, 'opened') = 'opened')::bigint AS whatsapp_contacts,
        count(*) FILTER (WHERE event_type = 'contact_phone' AND COALESCE(contact_status, 'opened') = 'opened')::bigint AS phone_contacts,
        count(DISTINCT actor_key) FILTER (
          WHERE event_type IN ('contact_whatsapp', 'contact_phone')
            AND COALESCE(contact_status, 'opened') = 'opened'
        )::bigint AS unique_contact_actors
      FROM scoped_events
    )
    SELECT jsonb_build_object(
      'shop', (
        SELECT jsonb_build_object(
          'id', shop_meta.id,
          'name', shop_meta.name,
          'unique_id', shop_meta.unique_id,
          'city_name', shop_meta.city_name
        )
        FROM shop_meta
      ),
      'window_days', v_days,
      'totals', (
        SELECT jsonb_build_object(
          'views', total_views,
          'repo_search_views', repo_search_views,
          'contacts', total_contacts,
          'whatsapp_contacts', whatsapp_contacts,
          'phone_contacts', phone_contacts,
          'unique_contact_actors', unique_contact_actors,
          'conversion_rate',
            CASE
              WHEN total_views > 0
                THEN round((total_contacts::numeric / total_views::numeric) * 100, 1)
              ELSE 0
            END
        )
        FROM totals
      ),
      'timeline', (
        SELECT COALESCE(jsonb_agg(row_to_json(daily_rollup) ORDER BY daily_rollup.event_date), '[]'::jsonb)
        FROM daily_rollup
      ),
      'recent_contacts', (
        SELECT COALESCE(jsonb_agg(row_to_json(contact_row) ORDER BY contact_row.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT
            cf.id::bigint AS id,
            COALESCE(ar.actor_name, 'Guest visitor') AS actor_name,
            ar.actor_email,
            ar.actor_phone,
            ar.actor_user_id,
            cf.event_type,
            cf.event_source,
            'opened'::text AS contact_status,
            cf.created_at,
            cf.ip_address,
            cf.device_fingerprint,
            p.name AS product_name,
            ar.total_contacts AS actor_contact_count,
            ar.risk_level
          FROM contact_feed_rollup cf
          LEFT JOIN public.products p ON p.id = cf.product_id
          LEFT JOIN actor_rollup ar ON ar.actor_key = cf.actor_key
          ORDER BY cf.created_at DESC
          LIMIT 40
        ) AS contact_row
      ),
      'suspicious_contacts', (
        SELECT COALESCE(jsonb_agg(row_to_json(actor_row) ORDER BY actor_row.total_contacts DESC, actor_row.latest_contact_at DESC), '[]'::jsonb)
        FROM (
          SELECT
            actor_key,
            COALESCE(actor_name, 'Guest visitor') AS actor_name,
            actor_email,
            actor_phone,
            actor_user_id,
            ip_address,
            device_fingerprint,
            total_contacts,
            whatsapp_contacts,
            phone_contacts,
            distinct_products,
            latest_contact_at,
            risk_level
          FROM actor_rollup
          WHERE total_contacts >= 3
        ) AS actor_row
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_dashboard_payload(
    p_is_super_admin boolean,
    p_city_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_result jsonb;
    v_now_lagos date := (now() AT TIME ZONE 'Africa/Lagos')::date;
BEGIN
    SELECT jsonb_build_object(
        'summary', jsonb_build_object(
            'shop_count', (
                SELECT count(*)::int
                FROM shops
                WHERE (p_is_super_admin OR p_city_id IS NULL OR city_id = p_city_id)
            ),
            'inactive_users_count', (
                SELECT count(*)::int
                FROM auth.users u
                LEFT JOIN public.profiles p ON p.id = u.id
                LEFT JOIN public.staff_profiles sp ON sp.id = u.id
                WHERE sp.id IS NULL
                  AND u.email IS NOT NULL
                  AND (p_city_id IS NULL OR p.city_id = p_city_id)
                  AND coalesce(u.last_sign_in_at, u.created_at) <= now() - interval '180 days'
            ),
            'visits_today', (
                SELECT coalesce(sum(total_visits), 0)::int
                FROM daily_site_visits
                WHERE visit_date = v_now_lagos
            )
        ),
        'counts', jsonb_build_object(
            'verifications', (
                SELECT (
                    (SELECT count(*)::int FROM shops WHERE status = 'pending' AND (p_is_super_admin OR p_city_id IS NULL OR city_id = p_city_id)) +
                    (SELECT count(*)::int FROM shops WHERE kyc_status = 'submitted' AND (p_is_super_admin OR p_city_id IS NULL OR city_id = p_city_id))
                )
            ),
            'products', (
                SELECT count(*)::int
                FROM products p
                JOIN shops s ON p.shop_id = s.id
                WHERE p.is_approved = false
                  AND p.rejection_reason IS NULL
                  AND (p_is_super_admin OR p_city_id IS NULL OR s.city_id = p_city_id)
            ),
            'payments', (
                CASE WHEN p_is_super_admin THEN
                    (SELECT count(*)::int FROM offline_payment_proofs WHERE status = 'pending')
                ELSE 0 END
            ),
            'community', (
                SELECT count(*)::int
                FROM shop_comments c
                JOIN shops s ON c.shop_id = s.id
                WHERE c.status = 'pending'
                  AND (p_is_super_admin OR p_city_id IS NULL OR s.city_id = p_city_id)
            ),
            'content', (
                SELECT count(*)::int
                FROM shop_banners_news bn
                JOIN shops s ON bn.shop_id = s.id
                WHERE bn.status = 'pending'
                  AND (p_is_super_admin OR p_city_id IS NULL OR s.city_id = p_city_id)
            ),
            'inbox', (
                (SELECT count(*)::int FROM contact_messages WHERE status = 'unread' OR status IS NULL) +
                (SELECT count(*)::int
                 FROM abuse_reports r
                 JOIN profiles p ON r.reporter_id = p.id
                 WHERE (r.status = 'pending' OR r.status IS NULL)
                   AND (p_is_super_admin OR p_city_id IS NULL OR p.city_id = p_city_id)
                )
            ),
            'radar', (
                CASE WHEN p_is_super_admin THEN
                    (SELECT count(*)::int FROM ctm_get_security_radar_insights())
                ELSE 0 END
            )
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

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
      shop_id,
      actor_key,
      count(*) FILTER (
        WHERE event_type IN ('contact_whatsapp', 'contact_phone')
          AND COALESCE(contact_status, 'opened') = 'opened'
      )::bigint AS total_contacts
    FROM scoped_events
    GROUP BY shop_id, actor_key
  ),
  suspicious_counts AS (
    SELECT
      shop_id,
      count(*) FILTER (WHERE total_contacts >= 3)::bigint AS suspicious_actor_count
    FROM actor_risk
    GROUP BY shop_id
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

CREATE OR REPLACE FUNCTION public.redeem_verification_promo_code(
  p_merchant_id uuid,
  p_code text,
  p_shop_id bigint DEFAULT NULL,
  p_merchant_name text DEFAULT NULL,
  p_shop_name text DEFAULT NULL,
  p_city_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_normalized_code text := regexp_replace(upper(trim(coalesce(p_code, ''))), '[^A-Z0-9]', '', 'g');
  v_payment_ref text;
  v_shop_name text := coalesce(nullif(trim(p_shop_name), ''), 'your shop');
  v_promo_id uuid;
  v_existing_payment_merchant uuid;
  v_code_exists boolean := false;
BEGIN
  PERFORM 1
  FROM public.physical_verification_payments
  WHERE merchant_id = p_merchant_id
    AND status = 'success'
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Verification fee already confirmed. You can continue to video KYC.'
    );
  END IF;

  IF length(v_normalized_code) <> 6 THEN
    RAISE EXCEPTION 'Promo code must be 6 alphanumeric characters.';
  END IF;

  v_payment_ref := 'PROMO_' || v_normalized_code;

  SELECT merchant_id
  INTO v_existing_payment_merchant
  FROM public.physical_verification_payments
  WHERE payment_ref = v_payment_ref
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_payment_merchant IS NOT NULL THEN
    IF v_existing_payment_merchant = p_merchant_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'message', 'Promo code already verified.'
      );
    END IF;

    RAISE EXCEPTION 'Invalid or already used promo code.';
  END IF;

  SELECT p.id
  INTO v_promo_id
  FROM public.promo_codes p
  WHERE (
      trim(coalesce(p.code, '')) = trim(coalesce(p_code, ''))
      OR upper(trim(coalesce(p.code, ''))) = upper(trim(coalesce(p_code, '')))
      OR regexp_replace(upper(trim(coalesce(p.code, ''))), '[^A-Z0-9]', '', 'g') = v_normalized_code
    )
    AND coalesce(p.is_used, false) = false
  ORDER BY p.created_at ASC, p.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_promo_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.promo_codes p
      WHERE
        trim(coalesce(p.code, '')) = trim(coalesce(p_code, ''))
        OR upper(trim(coalesce(p.code, ''))) = upper(trim(coalesce(p_code, '')))
        OR regexp_replace(upper(trim(coalesce(p.code, ''))), '[^A-Z0-9]', '', 'g') = v_normalized_code
    )
    INTO v_code_exists;

    IF v_code_exists THEN
      RAISE EXCEPTION 'Invalid or already used promo code.';
    END IF;

    RAISE EXCEPTION 'Promo code not found.';
  END IF;

  UPDATE public.promo_codes
  SET
    code = v_normalized_code,
    is_used = true,
    used_by = p_merchant_id,
    used_at = now()
  WHERE id = v_promo_id;

  INSERT INTO public.physical_verification_payments (
    merchant_id,
    merchant_name,
    shop_name,
    city,
    amount,
    payment_ref,
    status
  )
  VALUES (
    p_merchant_id,
    p_merchant_name,
    p_shop_name,
    p_city_name,
    0,
    v_payment_ref,
    'success'
  );

  PERFORM public.push_user_notification(
    p_merchant_id,
    'Verification Fee Confirmed',
    'Your promo code has been accepted for "' || v_shop_name || '". You can now continue to video KYC.',
    'verification_payment_confirmed',
    CASE
      WHEN p_shop_id IS NOT NULL THEN '/merchant-video-kyc?shop_id=' || p_shop_id::text
      ELSE '/vendor-panel'
    END
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Promo code successfully redeemed and verification recorded.'
  );
END;
$$;
