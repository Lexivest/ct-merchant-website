-- Pass 4: public function lint cleanup and compatibility fixes.
-- This removes stale debug/view references, restores columns used by RPCs,
-- and keeps older RPC signatures working through wrappers.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

UPDATE public.shops
SET updated_at = coalesce(updated_at, created_at, now())
WHERE updated_at IS NULL;

UPDATE public.products
SET updated_at = coalesce(updated_at, created_at, now())
WHERE updated_at IS NULL;

DROP FUNCTION IF EXISTS public.register_or_update_shop(
  text, text, text, text, text, bigint, bigint, text, text,
  numeric, numeric, text, text, text, text, text
);

DROP FUNCTION IF EXISTS public.register_or_update_shop(
  text, text, text, text, text, bigint, bigint, text, text,
  double precision, double precision, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.stamp_profile_footprint(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
     AND NOT (SELECT public.is_staff_member()) THEN
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
    v_user_agent := null;
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

CREATE OR REPLACE FUNCTION public.stamp_profile_footprint()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.stamp_profile_footprint((SELECT auth.uid()));
END;
$$;

GRANT EXECUTE ON FUNCTION public.stamp_profile_footprint(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stamp_profile_footprint() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ctm_security_heartbeat(
  p_email text,
  p_action text DEFAULT 'CHECK'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_user_id uuid;
  v_normalized_email text := lower(trim(coalesce(p_email, '')));
  v_action text := upper(trim(coalesce(p_action, 'CHECK')));
  v_payload jsonb;
BEGIN
  IF v_normalized_email = '' THEN
    RETURN jsonb_build_object(
      'status', 'CLEAR',
      'is_blocked', false,
      'remaining', 3,
      'is_staff', false,
      'user_id', null
    );
  END IF;

  SELECT u.id
  INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_normalized_email
  LIMIT 1;

  IF v_user_id IS NOT NULL AND v_action = 'FAILURE' THEN
    INSERT INTO public.login_security_guards (
      email,
      user_id,
      failed_attempts,
      last_failed_at,
      suspended_at,
      suspension_reason,
      updated_at
    )
    VALUES (
      v_normalized_email,
      v_user_id,
      1,
      now(),
      null,
      null,
      now()
    )
    ON CONFLICT (email) DO UPDATE
    SET
      user_id = coalesce(excluded.user_id, public.login_security_guards.user_id),
      failed_attempts = CASE
        WHEN public.login_security_guards.suspended_at IS NOT NULL
          THEN greatest(public.login_security_guards.failed_attempts, 3)
        ELSE least(public.login_security_guards.failed_attempts + 1, 3)
      END,
      last_failed_at = now(),
      suspended_at = CASE
        WHEN public.login_security_guards.suspended_at IS NOT NULL
          THEN public.login_security_guards.suspended_at
        WHEN public.login_security_guards.failed_attempts + 1 >= 3
          THEN now()
        ELSE null
      END,
      suspension_reason = CASE
        WHEN public.login_security_guards.suspended_at IS NOT NULL
          THEN coalesce(public.login_security_guards.suspension_reason, 'too_many_wrong_password_attempts')
        WHEN public.login_security_guards.failed_attempts + 1 >= 3
          THEN 'too_many_wrong_password_attempts'
        ELSE null
      END,
      updated_at = now();
  ELSIF v_user_id IS NOT NULL AND v_action = 'SUCCESS' THEN
    UPDATE public.login_security_guards
    SET
      failed_attempts = 0,
      last_failed_at = null,
      last_success_at = now(),
      updated_at = now()
    WHERE email = v_normalized_email
      AND suspended_at IS NULL;
  END IF;

  SELECT jsonb_build_object(
    'status',
    CASE
      WHEN coalesce(p.is_suspended, false) THEN 'SUSPENDED'
      WHEN lsg.suspended_at IS NOT NULL THEN 'BRUTE_FORCE_LOCK'
      ELSE 'CLEAR'
    END,
    'is_blocked', (coalesce(p.is_suspended, false) OR lsg.suspended_at IS NOT NULL),
    'remaining', greatest(0, 3 - coalesce(lsg.failed_attempts, 0)),
    'is_staff', (sp.id IS NOT NULL),
    'user_id', u.id
  )
  INTO v_payload
  FROM auth.users u
  LEFT JOIN public.profiles p
    ON p.id = u.id
  LEFT JOIN public.login_security_guards lsg
    ON lsg.email = lower(u.email)
  LEFT JOIN public.staff_profiles sp
    ON sp.id = u.id
  WHERE lower(u.email) = v_normalized_email
  LIMIT 1;

  IF v_payload IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'CLEAR',
      'is_blocked', false,
      'remaining', 3,
      'is_staff', false,
      'user_id', v_user_id
    );
  END IF;

  RETURN v_payload;
END;
$$;

DROP FUNCTION IF EXISTS public.ctm_security_heartbeat(text, boolean);

CREATE OR REPLACE FUNCTION public.ctm_security_heartbeat(
  p_email text,
  p_register_failure boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.ctm_security_heartbeat(
    p_email,
    CASE WHEN p_register_failure THEN 'FAILURE' ELSE 'CHECK' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ctm_security_heartbeat(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_security_heartbeat(text, boolean) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ctm_reinstate_login_guard(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (SELECT public.is_staff_member()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.login_security_guards
  SET
    failed_attempts = 0,
    suspended_at = null,
    suspension_reason = null,
    updated_at = now()
  WHERE email = lower(trim(p_email));

  RETURN found;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ctm_reinstate_login_guard(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_shop_detail_payload(
  p_shop_id bigint,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_effective_user_id uuid := coalesce(p_user_id, (SELECT auth.uid()));
  v_is_owner boolean := false;
  v_is_staff boolean := false;
  v_is_visible boolean := false;
  v_now timestamp with time zone := now();
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = p_shop_id
      AND s.owner_id = v_effective_user_id
  )
  INTO v_is_owner;

  v_is_staff := (SELECT public.ctm_has_staff_access());

  SELECT EXISTS (
    SELECT 1
    FROM public.shops s
    JOIN public.cities c ON c.id = s.city_id
    WHERE s.id = p_shop_id
      AND (
        v_is_owner
        OR v_is_staff
        OR (
          s.status = 'approved'::application_status
          AND s.is_verified = true
          AND s.is_open = true
          AND s.subscription_end_date > v_now
          AND c.is_open = true
        )
      )
  )
  INTO v_is_visible;

  IF NOT v_is_visible THEN
    RETURN jsonb_build_object(
      'shop', null,
      'products', '[]'::jsonb,
      'like_count', 0,
      'has_liked', false,
      'shop_banner', '',
      'approved_news', '[]'::jsonb,
      'owner_profile', null
    );
  END IF;

  SELECT jsonb_build_object(
    'shop', (
      SELECT row_to_json(s.*)
      FROM (
        SELECT s.*, c.name AS city_name
        FROM public.shops s
        LEFT JOIN public.cities c ON s.city_id = c.id
        WHERE s.id = p_shop_id
      ) s
    ),
    'products', (
      SELECT coalesce(jsonb_agg(p), '[]'::jsonb)
      FROM (
        SELECT *
        FROM public.products
        WHERE shop_id = p_shop_id
          AND is_available = true
          AND (is_approved = true OR v_is_owner OR v_is_staff)
        ORDER BY id ASC
        LIMIT 100
      ) p
    ),
    'like_count', (
      SELECT count(*)::int
      FROM public.shop_likes
      WHERE shop_id = p_shop_id
    ),
    'has_liked', (
      CASE
        WHEN v_effective_user_id IS NOT NULL THEN
          EXISTS (
            SELECT 1
            FROM public.shop_likes
            WHERE shop_id = p_shop_id
              AND user_id = v_effective_user_id
          )
        ELSE false
      END
    ),
    'shop_banner', (
      SELECT content_data
      FROM public.shop_banners_news
      WHERE shop_id = p_shop_id
        AND status = 'approved'
        AND content_type = 'banner'
      ORDER BY created_at DESC
      LIMIT 1
    ),
    'approved_news', (
      SELECT coalesce(jsonb_agg(news.content_data), '[]'::jsonb)
      FROM (
        SELECT content_data
        FROM public.shop_banners_news
        WHERE shop_id = p_shop_id
          AND status = 'approved'
          AND content_type = 'news'
        ORDER BY created_at DESC
      ) news
    ),
    'owner_profile', (
      SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url
      )
      FROM public.profiles p
      JOIN public.shops s ON s.owner_id = p.id
      WHERE s.id = p_shop_id
      LIMIT 1
    )
  )
  INTO v_result;

  IF p_user_id IS NOT NULL AND NOT v_is_owner THEN
    INSERT INTO public.shop_views (shop_id, viewer_id)
    VALUES (p_shop_id, p_user_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_detail_payload(bigint, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.redeem_verification_promo_code(
  p_merchant_id uuid,
  p_code text,
  p_merchant_name text,
  p_shop_name text,
  p_city_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment_ref text;
BEGIN
  v_payment_ref := 'PROMO_' || p_code;

  IF EXISTS (
    SELECT 1
    FROM public.physical_verification_payments
    WHERE payment_ref = v_payment_ref
  ) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'message', 'Promo code already verified.');
  END IF;

  PERFORM 1
  FROM public.promo_codes
  WHERE code = p_code
    AND is_used = false
  FOR UPDATE;

  IF NOT found THEN
    RAISE EXCEPTION 'Invalid or already used promo code.';
  END IF;

  UPDATE public.promo_codes
  SET
    is_used = true,
    used_by = p_merchant_id,
    used_at = now()
  WHERE code = p_code;

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

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Promo code successfully redeemed and verification recorded.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_repo_search_rate_limit(
  p_key_hash text,
  p_term_hash text DEFAULT NULL::text,
  p_window_seconds integer DEFAULT 60,
  p_max_requests integer DEFAULT 15,
  p_cooldown_seconds integer DEFAULT 180,
  p_max_cooldown_seconds integer DEFAULT 3600
)
RETURNS TABLE(
  allowed boolean,
  retry_after_seconds integer,
  blocked_until timestamp with time zone,
  request_count integer,
  violation_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.repo_search_rate_limits%rowtype;
  v_window interval := make_interval(secs => greatest(coalesce(p_window_seconds, 60), 1));
  v_next_count integer;
  v_next_violation_count integer;
  v_base_cooldown integer := greatest(coalesce(p_cooldown_seconds, 180), 1);
  v_max_cooldown integer := greatest(coalesce(p_max_cooldown_seconds, 3600), v_base_cooldown);
  v_cooldown_seconds integer;
  v_blocked_until timestamptz;
  v_past timestamptz := v_now - interval '1 year';
BEGIN
  IF coalesce(p_key_hash, '') = '' THEN
    RETURN QUERY SELECT false, v_base_cooldown, v_now + make_interval(secs => v_base_cooldown), 0, 0;
    RETURN;
  END IF;

  INSERT INTO public.repo_search_rate_limits (
    key_hash,
    window_started_at,
    request_count,
    blocked_until,
    violation_count,
    last_request_at,
    last_term_hash
  )
  VALUES (p_key_hash, v_past, 0, null, 0, v_past, p_term_hash)
  ON CONFLICT (key_hash) DO NOTHING;

  SELECT *
  INTO v_row
  FROM public.repo_search_rate_limits
  WHERE key_hash = p_key_hash
  FOR UPDATE;

  IF v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
    RETURN QUERY
      SELECT
        false,
        greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer),
        v_row.blocked_until,
        v_row.request_count,
        v_row.violation_count;
    RETURN;
  END IF;

  v_next_violation_count := v_row.violation_count;
  IF v_row.last_request_at < v_now - interval '10 minutes' THEN
    v_next_violation_count := 0;
  END IF;

  IF v_row.window_started_at <= v_now - v_window THEN
    UPDATE public.repo_search_rate_limits
    SET
      window_started_at = v_now,
      request_count = 1,
      blocked_until = null,
      last_request_at = v_now,
      last_term_hash = p_term_hash,
      violation_count = v_next_violation_count
    WHERE key_hash = p_key_hash;

    RETURN QUERY SELECT true, 0, null::timestamptz, 1, v_next_violation_count;
    RETURN;
  END IF;

  v_next_count := v_row.request_count + 1;

  IF v_next_count > greatest(coalesce(p_max_requests, 15), 1) THEN
    v_next_violation_count := v_next_violation_count + 1;
    v_cooldown_seconds := least(
      v_max_cooldown,
      v_base_cooldown * power(2, least(v_next_violation_count - 1, 5))::integer
    );
    v_blocked_until := v_now + make_interval(secs => v_cooldown_seconds);

    UPDATE public.repo_search_rate_limits
    SET
      request_count = v_next_count,
      violation_count = v_next_violation_count,
      blocked_until = v_blocked_until,
      last_request_at = v_now,
      last_term_hash = p_term_hash
    WHERE key_hash = p_key_hash;

    RETURN QUERY SELECT false, v_cooldown_seconds, v_blocked_until, v_next_count, v_next_violation_count;
    RETURN;
  END IF;

  UPDATE public.repo_search_rate_limits
  SET
    request_count = v_next_count,
    blocked_until = null,
    last_request_at = v_now,
    last_term_hash = p_term_hash,
    violation_count = v_next_violation_count
  WHERE key_hash = p_key_hash;

  RETURN QUERY SELECT true, 0, null::timestamptz, v_next_count, v_next_violation_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_site_visit(
  p_session_key text DEFAULT NULL::text,
  p_visitor_key text DEFAULT NULL::text,
  p_page_path text DEFAULT NULL::text,
  p_referrer_path text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_authenticated boolean := (SELECT auth.uid()) IS NOT NULL;
  v_today date := (timezone('Africa/Lagos', now()))::date;
BEGIN
  -- Parameters are retained for API compatibility, but page-level tracking is disabled.
  PERFORM p_session_key, p_visitor_key, p_page_path, p_referrer_path;

  INSERT INTO public.daily_site_visits (visit_date, total_visits, authenticated_visits)
  VALUES (
    v_today,
    1,
    CASE WHEN v_is_authenticated THEN 1 ELSE 0 END
  )
  ON CONFLICT (visit_date) DO UPDATE
  SET
    total_visits = public.daily_site_visits.total_visits + 1,
    authenticated_visits = public.daily_site_visits.authenticated_visits
      + (CASE WHEN v_is_authenticated THEN 1 ELSE 0 END);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_site_visit_top_pages(
  p_days integer DEFAULT 30,
  p_limit integer DEFAULT 8
)
RETURNS TABLE(page_path text, total_visits bigint, unique_visitors bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (SELECT public.is_staff_member()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT null::text, 0::bigint, 0::bigint
  FROM (SELECT greatest(coalesce(p_days, 30), 1) AS days_window) args
  WHERE args.days_window IS NULL
  LIMIT greatest(coalesce(p_limit, 8), 1);
END;
$$;
