-- Pass 3 security hardening:
-- Move the remaining app-facing SECURITY DEFINER functions out of the exposed
-- public schema and replace them with SECURITY INVOKER wrappers.
--
-- This keeps the existing RPC names and grants stable for the frontend while
-- removing direct public exposure of the privileged implementations.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

DO $wrap$
DECLARE
  fn record;
  fn_oid oid;
  fn_result text;
  fn_returns_set boolean;
  fn_volatility text;
  fn_parallel text;
  fn_strict text;
  wrapper_body text;
BEGIN
  CREATE TEMP TABLE tmp_security_wrapper_spec (
    proname text NOT NULL,
    identity_args text NOT NULL,
    full_args text NOT NULL,
    call_args text NOT NULL,
    grant_roles text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_security_wrapper_spec (
    proname,
    identity_args,
    full_args,
    call_args,
    grant_roles
  )
  VALUES
    (
      'ctm_security_heartbeat',
      'p_email text, p_action text',
      'p_email text, p_action text DEFAULT ''CHECK''',
      'p_email, p_action',
      'anon, authenticated, service_role'
    ),
    (
      'ctm_security_heartbeat',
      'p_email text, p_register_failure boolean',
      'p_email text, p_register_failure boolean',
      'p_email, p_register_failure',
      'anon, authenticated, service_role'
    ),
    (
      'get_city_stats',
      '',
      '',
      '',
      'anon, authenticated, service_role'
    ),
    (
      'get_product_detail_payload',
      'p_product_id bigint, p_user_id uuid',
      'p_product_id bigint, p_user_id uuid',
      'p_product_id, p_user_id',
      'anon, authenticated, service_role'
    ),
    (
      'get_public_profiles',
      'profile_ids uuid[]',
      'profile_ids uuid[]',
      'profile_ids',
      'anon, authenticated, service_role'
    ),
    (
      'get_shop_detail_payload',
      'p_shop_id bigint, p_user_id uuid',
      'p_shop_id bigint, p_user_id uuid',
      'p_shop_id, p_user_id',
      'anon, authenticated, service_role'
    ),
    (
      'log_shop_analytics_event',
      'p_shop_id bigint, p_event_type text, p_product_id bigint, p_event_source text, p_contact_status text, p_repo_ref text, p_device_fingerprint text, p_user_agent text, p_metadata jsonb',
      'p_shop_id bigint, p_event_type text, p_product_id bigint, p_event_source text, p_contact_status text, p_repo_ref text, p_device_fingerprint text, p_user_agent text, p_metadata jsonb',
      'p_shop_id, p_event_type, p_product_id, p_event_source, p_contact_status, p_repo_ref, p_device_fingerprint, p_user_agent, p_metadata',
      'anon, authenticated, service_role'
    ),
    (
      'match_products',
      'search_text text, match_limit integer',
      'search_text text, match_limit integer',
      'search_text, match_limit',
      'anon, authenticated, service_role'
    ),
    (
      'record_site_visit',
      'p_session_key text, p_visitor_key text, p_page_path text, p_referrer_path text',
      'p_session_key text DEFAULT NULL::text, p_visitor_key text DEFAULT NULL::text, p_page_path text DEFAULT NULL::text, p_referrer_path text DEFAULT NULL::text',
      'p_session_key, p_visitor_key, p_page_path, p_referrer_path',
      'anon, authenticated, service_role'
    ),
    (
      'ctm_get_contact_security_radar',
      'p_days integer, p_city_id bigint',
      'p_days integer, p_city_id bigint',
      'p_days, p_city_id',
      'authenticated, service_role'
    ),
    (
      'ctm_get_security_radar_insights',
      '',
      '',
      '',
      'authenticated, service_role'
    ),
    (
      'ctm_get_shop_analytics_summary',
      'p_shop_id bigint, p_days integer',
      'p_shop_id bigint, p_days integer',
      'p_shop_id, p_days',
      'authenticated, service_role'
    ),
    (
      'ctm_get_staff_shop_analytics',
      'p_days integer, p_city_id bigint, p_limit integer',
      'p_days integer, p_city_id bigint, p_limit integer',
      'p_days, p_city_id, p_limit',
      'authenticated, service_role'
    ),
    (
      'ctm_purge_old_shop_analytics_data',
      'p_keep_days integer',
      'p_keep_days integer',
      'p_keep_days',
      'authenticated, service_role'
    ),
    (
      'ctm_reinstate_login_guard',
      'p_email text',
      'p_email text',
      'p_email',
      'authenticated, service_role'
    ),
    (
      'ctm_staff_update_user_status',
      'p_user_id uuid, p_email text, p_suspend boolean, p_reason text',
      'p_user_id uuid, p_email text, p_suspend boolean, p_reason text DEFAULT NULL::text',
      'p_user_id, p_email, p_suspend, p_reason',
      'authenticated, service_role'
    ),
    (
      'get_dashboard_payload',
      'p_user_id uuid, p_city_id bigint',
      'p_user_id uuid, p_city_id bigint',
      'p_user_id, p_city_id',
      'authenticated, service_role'
    ),
    (
      'get_staff_dashboard_payload',
      'p_is_super_admin boolean, p_city_id bigint',
      'p_is_super_admin boolean, p_city_id bigint',
      'p_is_super_admin, p_city_id',
      'authenticated, service_role'
    ),
    (
      'manage_product',
      'p_product_id bigint, p_shop_id bigint, p_name text, p_description text, p_price numeric, p_discount_price numeric, p_condition text, p_category text, p_image_url text, p_image_url_2 text, p_image_url_3 text, p_stock_count integer, p_attributes jsonb, p_is_available boolean',
      'p_product_id bigint DEFAULT NULL, p_shop_id bigint DEFAULT NULL, p_name text DEFAULT NULL, p_description text DEFAULT NULL, p_price numeric DEFAULT NULL, p_discount_price numeric DEFAULT NULL, p_condition text DEFAULT NULL, p_category text DEFAULT NULL, p_image_url text DEFAULT NULL, p_image_url_2 text DEFAULT NULL, p_image_url_3 text DEFAULT NULL, p_stock_count integer DEFAULT 1, p_attributes jsonb DEFAULT ''{}''::jsonb, p_is_available boolean DEFAULT true',
      'p_product_id, p_shop_id, p_name, p_description, p_price, p_discount_price, p_condition, p_category, p_image_url, p_image_url_2, p_image_url_3, p_stock_count, p_attributes, p_is_available',
      'authenticated, service_role'
    ),
    (
      'redeem_verification_promo_code_self',
      'p_code text, p_shop_id bigint',
      'p_code text, p_shop_id bigint',
      'p_code, p_shop_id',
      'authenticated, service_role'
    ),
    (
      'register_or_update_shop',
      'p_name text, p_description text, p_address text, p_phone text, p_whatsapp text, p_city_id bigint, p_area_id bigint, p_category text, p_business_type text, p_latitude double precision, p_longitude double precision, p_id_type text, p_id_number text, p_cac_number text, p_image_url text, p_storefront_url text, p_id_card_url text, p_cac_certificate_url text, p_kyc_video_url text, p_facebook_url text, p_instagram_url text, p_twitter_url text, p_tiktok_url text, p_website_url text',
      'p_name text, p_description text DEFAULT NULL, p_address text DEFAULT NULL, p_phone text DEFAULT NULL, p_whatsapp text DEFAULT NULL, p_city_id bigint DEFAULT NULL, p_area_id bigint DEFAULT NULL, p_category text DEFAULT NULL, p_business_type text DEFAULT NULL, p_latitude double precision DEFAULT NULL, p_longitude double precision DEFAULT NULL, p_id_type text DEFAULT NULL, p_id_number text DEFAULT NULL, p_cac_number text DEFAULT NULL, p_image_url text DEFAULT NULL, p_storefront_url text DEFAULT NULL, p_id_card_url text DEFAULT NULL, p_cac_certificate_url text DEFAULT NULL, p_kyc_video_url text DEFAULT NULL, p_facebook_url text DEFAULT NULL, p_instagram_url text DEFAULT NULL, p_twitter_url text DEFAULT NULL, p_tiktok_url text DEFAULT NULL, p_website_url text DEFAULT NULL',
      'p_name, p_description, p_address, p_phone, p_whatsapp, p_city_id, p_area_id, p_category, p_business_type, p_latitude, p_longitude, p_id_type, p_id_number, p_cac_number, p_image_url, p_storefront_url, p_id_card_url, p_cac_certificate_url, p_kyc_video_url, p_facebook_url, p_instagram_url, p_twitter_url, p_tiktok_url, p_website_url',
      'authenticated, service_role'
    ),
    (
      'staff_site_visit_daily',
      'p_days integer',
      'p_days integer DEFAULT 30',
      'p_days',
      'authenticated, service_role'
    ),
    (
      'staff_site_visit_top_pages',
      'p_days integer, p_limit integer',
      'p_days integer DEFAULT 30, p_limit integer DEFAULT 8',
      'p_days, p_limit',
      'authenticated, service_role'
    ),
    (
      'staff_user_activity_summary',
      'p_inactive_days integer, p_city_id bigint',
      'p_inactive_days integer DEFAULT 180, p_city_id bigint DEFAULT NULL::bigint',
      'p_inactive_days, p_city_id',
      'authenticated, service_role'
    ),
    (
      'stamp_profile_footprint',
      '',
      '',
      '',
      'authenticated, service_role'
    ),
    (
      'stamp_profile_footprint',
      'p_target_user_id uuid',
      'p_target_user_id uuid',
      'p_target_user_id',
      'authenticated, service_role'
    );

  FOR fn IN
    SELECT *
    FROM tmp_security_wrapper_spec
    ORDER BY proname, identity_args
  LOOP
    SELECT
      p.oid,
      pg_get_function_result(p.oid),
      p.proretset,
      CASE p.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE'
        ELSE 'VOLATILE'
      END,
      CASE p.proparallel
        WHEN 's' THEN 'PARALLEL SAFE'
        WHEN 'r' THEN 'PARALLEL RESTRICTED'
        ELSE 'PARALLEL UNSAFE'
      END,
      CASE
        WHEN p.proisstrict THEN 'STRICT'
        ELSE ''
      END
    INTO
      fn_oid,
      fn_result,
      fn_returns_set,
      fn_volatility,
      fn_parallel,
      fn_strict
    FROM pg_proc p
    JOIN pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = fn.proname
      AND pg_get_function_identity_arguments(p.oid) = fn.identity_args;

    IF fn_oid IS NULL THEN
      RAISE NOTICE 'Skipping public.%(%) because no SECURITY DEFINER implementation was found.',
        fn.proname,
        fn.identity_args;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET SCHEMA private',
      fn.proname,
      fn.identity_args
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION private.%I(%s) FROM PUBLIC, anon, authenticated, service_role',
      fn.proname,
      fn.identity_args
    );

    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION private.%I(%s) TO %s',
      fn.proname,
      fn.identity_args,
      fn.grant_roles
    );

    wrapper_body := CASE
      WHEN fn_result = 'void' THEN
        format('SELECT private.%I(%s);', fn.proname, fn.call_args)
      WHEN fn_returns_set THEN
        format('SELECT * FROM private.%I(%s);', fn.proname, fn.call_args)
      ELSE
        format('SELECT private.%I(%s);', fn.proname, fn.call_args)
    END;

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%1$I(%2$s)
       RETURNS %3$s
       LANGUAGE sql
       %4$s
       %5$s
       %6$s
       SET search_path TO ''public'', ''private'', ''pg_temp''
       AS $function$
         %7$s
       $function$',
      fn.proname,
      fn.full_args,
      fn_result,
      fn_volatility,
      fn_parallel,
      fn_strict,
      wrapper_body
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated, service_role',
      fn.proname,
      fn.identity_args
    );

    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO %s',
      fn.proname,
      fn.identity_args,
      fn.grant_roles
    );
  END LOOP;
END
$wrap$;
