-- Standardize product object paths to match the payment receipt ownership model:
-- merchant_uuid/shop_id/products/file.jpg
--
-- New product uploads must sit under a shop owned by the current user. Existing
-- legacy product images remain removable/updateable when they are already linked
-- from the owner's products rows.

CREATE OR REPLACE FUNCTION private.ctm_storage_object_owned_by_current_user(
  p_bucket_id text,
  p_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_uid_text text := v_uid::text;
  v_first_segment text := split_part(coalesce(p_name, ''), '/', 1);
  v_second_segment text := split_part(coalesce(p_name, ''), '/', 2);
BEGIN
  IF v_uid IS NULL OR v_uid_text = '' OR p_name IS NULL OR p_name = '' THEN
    RETURN false;
  END IF;

  IF p_bucket_id = 'products' THEN
    IF v_first_segment = v_uid_text
       AND v_second_segment ~ '^[0-9]+$'
       AND EXISTS (
         SELECT 1
         FROM public.shops s
         WHERE s.id = v_second_segment::bigint
           AND s.owner_id = v_uid
       )
    THEN
      RETURN true;
    END IF;

    RETURN EXISTS (
      SELECT 1
      FROM public.products p
      JOIN public.shops s ON s.id = p.shop_id
      WHERE s.owner_id = v_uid
        AND (
          public.ctm_storage_path_from_url(p.image_url, p_bucket_id) = p_name
          OR public.ctm_storage_path_from_url(p.image_url_2, p_bucket_id) = p_name
          OR public.ctm_storage_path_from_url(p.image_url_3, p_bucket_id) = p_name
        )
    );
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

REVOKE ALL ON FUNCTION private.ctm_storage_object_owned_by_current_user(text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ctm_storage_object_owned_by_current_user(text, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
