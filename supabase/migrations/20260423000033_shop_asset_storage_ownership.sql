-- Pass 6b: make legacy shop registration assets manageable by their merchant owner.
-- Some older logo/storefront/document files may not match the current prefix-based
-- ownership rules exactly, but they are still referenced by the merchant's shop row.

CREATE OR REPLACE FUNCTION public.ctm_storage_path_from_url(
  p_url text,
  p_bucket_id text
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_clean text;
  v_prefix text;
BEGIN
  IF p_url IS NULL OR p_url = '' THEN
    RETURN NULL;
  END IF;

  IF p_url NOT LIKE 'http%' THEN
    RETURN ltrim(p_url, '/');
  END IF;

  v_clean := split_part(p_url, '?', 1);

  v_prefix := '/storage/v1/object/public/' || p_bucket_id || '/';
  IF position(v_prefix in v_clean) > 0 THEN
    RETURN split_part(v_clean, v_prefix, 2);
  END IF;

  v_prefix := '/storage/v1/object/authenticated/' || p_bucket_id || '/';
  IF position(v_prefix in v_clean) > 0 THEN
    RETURN split_part(v_clean, v_prefix, 2);
  END IF;

  v_prefix := '/storage/v1/object/sign/' || p_bucket_id || '/';
  IF position(v_prefix in v_clean) > 0 THEN
    RETURN split_part(v_clean, v_prefix, 2);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ctm_storage_path_from_url(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_storage_path_from_url(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ctm_storage_object_owned_by_current_user(
  p_bucket_id text,
  p_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_uid_text text := v_uid::text;
  v_first_segment text := split_part(coalesce(p_name, ''), '/', 1);
BEGIN
  IF v_uid IS NULL OR v_uid_text = '' OR p_name IS NULL OR p_name = '' THEN
    RETURN false;
  END IF;

  IF p_name LIKE v_uid_text || '/%' THEN
    RETURN true;
  END IF;

  IF p_name LIKE v_uid_text || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'ids/' || v_uid_text || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'cac/' || v_uid_text || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'covers/' || v_uid_text || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'logos/' || v_uid_text || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_bucket_id = 'shops-banner-storage' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id::text = v_first_segment
        AND s.owner_id = v_uid
    );
  END IF;

  IF p_bucket_id = 'storefronts' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.owner_id = v_uid
        AND public.ctm_storage_path_from_url(s.storefront_url, p_bucket_id) = p_name
    );
  END IF;

  IF p_bucket_id = 'brand-assets' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.owner_id = v_uid
        AND public.ctm_storage_path_from_url(s.image_url, p_bucket_id) = p_name
    );
  END IF;

  IF p_bucket_id = 'id-documents' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.owner_id = v_uid
        AND public.ctm_storage_path_from_url(s.id_card_url, p_bucket_id) = p_name
    );
  END IF;

  IF p_bucket_id = 'cac-documents' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.owner_id = v_uid
        AND public.ctm_storage_path_from_url(s.cac_certificate_url, p_bucket_id) = p_name
    );
  END IF;

  IF p_bucket_id IN ('kyc-videos', 'kyc_videos') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.owner_id = v_uid
        AND public.ctm_storage_path_from_url(s.kyc_video_url, p_bucket_id) = p_name
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.ctm_storage_object_owned_by_current_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_storage_object_owned_by_current_user(text, text) TO authenticated, service_role;
