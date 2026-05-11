-- Keep shop map coordinates aligned with the live GPS captured during video KYC.
-- This makes coordinate sync backend-enforced, even if a staff approval path
-- updates kyc_status directly instead of calling update_shop_coordinate().

CREATE OR REPLACE FUNCTION public.sync_shop_coordinates_from_kyc_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_latitude_text text;
  v_longitude_text text;
  v_latitude double precision;
  v_longitude double precision;
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NEW.kyc_status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  v_latitude_text := nullif(trim(coalesce(NEW.kyc_submission_meta->>'latitude', '')), '');
  v_longitude_text := nullif(trim(coalesce(NEW.kyc_submission_meta->>'longitude', '')), '');

  IF v_latitude_text !~ '^[-+]?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))([eE][-+]?[0-9]+)?$'
     OR v_longitude_text !~ '^[-+]?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))([eE][-+]?[0-9]+)?$'
  THEN
    RETURN NEW;
  END IF;

  v_latitude := v_latitude_text::double precision;
  v_longitude := v_longitude_text::double precision;

  IF v_latitude < -90 OR v_latitude > 90 OR v_longitude < -180 OR v_longitude > 180 THEN
    RETURN NEW;
  END IF;

  NEW.latitude := v_latitude;
  NEW.longitude := v_longitude;
  NEW.kyc_submission_meta := coalesce(NEW.kyc_submission_meta, '{}'::jsonb)
    || jsonb_build_object(
      'latitude', v_latitude,
      'longitude', v_longitude,
      'coordinate_source', 'video_kyc_recording',
      'coordinate_synced_at', now(),
      'coordinate_synced_by', v_actor_id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_sync_shop_coordinates_from_kyc_meta ON public.shops;
CREATE TRIGGER zz_sync_shop_coordinates_from_kyc_meta
BEFORE INSERT OR UPDATE OF kyc_status, kyc_submission_meta ON public.shops
FOR EACH ROW
EXECUTE FUNCTION public.sync_shop_coordinates_from_kyc_meta();

WITH parsed AS (
  SELECT
    s.id,
    (s.kyc_submission_meta->>'latitude')::double precision AS latitude,
    (s.kyc_submission_meta->>'longitude')::double precision AS longitude
  FROM public.shops s
  WHERE s.kyc_status = 'approved'
    AND nullif(trim(coalesce(s.kyc_submission_meta->>'latitude', '')), '') ~ '^[-+]?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))([eE][-+]?[0-9]+)?$'
    AND nullif(trim(coalesce(s.kyc_submission_meta->>'longitude', '')), '') ~ '^[-+]?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))([eE][-+]?[0-9]+)?$'
)
UPDATE public.shops s
SET latitude = p.latitude,
    longitude = p.longitude,
    kyc_submission_meta = coalesce(s.kyc_submission_meta, '{}'::jsonb)
      || jsonb_build_object(
        'latitude', p.latitude,
        'longitude', p.longitude,
        'coordinate_source', 'video_kyc_recording',
        'coordinate_synced_at', now()
      ),
    updated_at = now()
FROM parsed p
WHERE s.id = p.id
  AND p.latitude BETWEEN -90 AND 90
  AND p.longitude BETWEEN -180 AND 180
  AND (
    s.latitude IS DISTINCT FROM p.latitude
    OR s.longitude IS DISTINCT FROM p.longitude
    OR s.kyc_submission_meta->>'coordinate_source' IS DISTINCT FROM 'video_kyc_recording'
  );

REVOKE ALL ON FUNCTION public.sync_shop_coordinates_from_kyc_meta() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_shop_coordinates_from_kyc_meta() TO service_role;
