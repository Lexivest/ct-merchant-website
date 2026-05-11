-- Update the shop coordinates from the live GPS captured during video KYC.
-- The exposed public RPC is SECURITY INVOKER; the privileged write lives in
-- private so PostgREST does not expose a SECURITY DEFINER function directly.

CREATE SCHEMA IF NOT EXISTS private;

GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.update_shop_coordinate(
  p_shop_id bigint,
  p_latitude double precision DEFAULT NULL::double precision,
  p_longitude double precision DEFAULT NULL::double precision,
  p_location_label text DEFAULT NULL::text,
  p_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_shop public.shops%ROWTYPE;
  v_updated_shop public.shops%ROWTYPE;
  v_latitude double precision := p_latitude;
  v_longitude double precision := p_longitude;
  v_meta_latitude text;
  v_meta_longitude text;
  v_location_label text;
  v_recorded_at timestamp with time zone := p_recorded_at;
  v_next_meta jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT private.ctm_has_super_staff_access() THEN
    RAISE EXCEPTION 'Only super admins can approve video KYC coordinates.' USING ERRCODE = '42501';
  END IF;

  IF p_shop_id IS NULL OR p_shop_id <= 0 THEN
    RAISE EXCEPTION 'A valid shop id is required.' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_shop
    FROM public.shops
   WHERE id = p_shop_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found.' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(v_shop.kyc_status, 'unsubmitted') NOT IN ('submitted', 'approved') THEN
    RAISE EXCEPTION 'This shop has no submitted video KYC coordinates to approve.' USING ERRCODE = '22023';
  END IF;

  v_meta_latitude := nullif(trim(coalesce(v_shop.kyc_submission_meta->>'latitude', '')), '');
  v_meta_longitude := nullif(trim(coalesce(v_shop.kyc_submission_meta->>'longitude', '')), '');

  IF v_latitude IS NULL
     AND v_meta_latitude ~ '^[-+]?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))([eE][-+]?[0-9]+)?$'
  THEN
    v_latitude := v_meta_latitude::double precision;
  END IF;

  IF v_longitude IS NULL
     AND v_meta_longitude ~ '^[-+]?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))([eE][-+]?[0-9]+)?$'
  THEN
    v_longitude := v_meta_longitude::double precision;
  END IF;

  IF v_latitude IS NULL OR v_longitude IS NULL THEN
    RAISE EXCEPTION 'Video KYC GPS coordinates are missing. Ask the merchant to resubmit KYC with location enabled.' USING ERRCODE = '22023';
  END IF;

  IF v_latitude < -90 OR v_latitude > 90 THEN
    RAISE EXCEPTION 'Video KYC latitude is outside the valid range.' USING ERRCODE = '22023';
  END IF;

  IF v_longitude < -180 OR v_longitude > 180 THEN
    RAISE EXCEPTION 'Video KYC longitude is outside the valid range.' USING ERRCODE = '22023';
  END IF;

  v_location_label := nullif(
    left(trim(coalesce(p_location_label, v_shop.kyc_submission_meta->>'location_label', '')), 160),
    ''
  );

  IF v_recorded_at IS NULL THEN
    BEGIN
      v_recorded_at := nullif(v_shop.kyc_submission_meta->>'recorded_at', '')::timestamp with time zone;
    EXCEPTION
      WHEN others THEN
        v_recorded_at := NULL;
    END;
  END IF;

  v_next_meta := coalesce(v_shop.kyc_submission_meta, '{}'::jsonb)
    || jsonb_build_object(
      'latitude', v_latitude,
      'longitude', v_longitude,
      'location_label', v_location_label,
      'recorded_at', v_recorded_at,
      'coordinate_source', 'video_kyc_recording',
      'coordinate_synced_at', now(),
      'coordinate_synced_by', v_actor_id
    );

  UPDATE public.shops
     SET latitude = v_latitude,
         longitude = v_longitude,
         kyc_status = 'approved',
         is_verified = true,
         rejection_reason = NULL,
         kyc_submission_meta = v_next_meta,
         updated_at = now()
   WHERE id = p_shop_id
   RETURNING *
   INTO v_updated_shop;

  RETURN jsonb_build_object(
    'success', true,
    'shop', to_jsonb(v_updated_shop),
    'coordinate', jsonb_build_object(
      'latitude', v_latitude,
      'longitude', v_longitude,
      'location_label', v_location_label,
      'recorded_at', v_recorded_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.update_shop_coordinate(
  bigint,
  double precision,
  double precision,
  text,
  timestamp with time zone
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.update_shop_coordinate(
  bigint,
  double precision,
  double precision,
  text,
  timestamp with time zone
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_shop_coordinate(
  p_shop_id bigint,
  p_latitude double precision DEFAULT NULL::double precision,
  p_longitude double precision DEFAULT NULL::double precision,
  p_location_label text DEFAULT NULL::text,
  p_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT private.update_shop_coordinate(
    p_shop_id,
    p_latitude,
    p_longitude,
    p_location_label,
    p_recorded_at
  );
$$;

REVOKE ALL ON FUNCTION public.update_shop_coordinate(
  bigint,
  double precision,
  double precision,
  text,
  timestamp with time zone
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_shop_coordinate(
  bigint,
  double precision,
  double precision,
  text,
  timestamp with time zone
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
