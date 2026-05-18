-- Repair storage RLS for product cleanup and normalize CTMerchant bucket rules.
-- Public buckets remain public for direct object reads, but object metadata writes
-- and deletes stay protected by storage.objects RLS.

CREATE SCHEMA IF NOT EXISTS private;

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
  IF position(v_prefix IN v_clean) > 0 THEN
    RETURN split_part(v_clean, v_prefix, 2);
  END IF;

  v_prefix := '/storage/v1/object/authenticated/' || p_bucket_id || '/';
  IF position(v_prefix IN v_clean) > 0 THEN
    RETURN split_part(v_clean, v_prefix, 2);
  END IF;

  v_prefix := '/storage/v1/object/sign/' || p_bucket_id || '/';
  IF position(v_prefix IN v_clean) > 0 THEN
    RETURN split_part(v_clean, v_prefix, 2);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ctm_storage_path_from_url(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_storage_path_from_url(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.ctm_storage_object_owned_by_current_user(
  p_bucket_id text,
  p_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
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

  IF p_bucket_id = 'products' THEN
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

REVOKE ALL ON FUNCTION private.ctm_storage_object_owned_by_current_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ctm_storage_object_owned_by_current_user(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ctm_storage_object_owned_by_current_user(
  p_bucket_id text,
  p_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, private
AS $$
  SELECT private.ctm_storage_object_owned_by_current_user(p_bucket_id, p_name);
$$;

REVOKE ALL ON FUNCTION public.ctm_storage_object_owned_by_current_user(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_storage_object_owned_by_current_user(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ctm_storage_object_owned_by_current_user(text, text) TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 512000, ARRAY['image/jpeg', 'image/png']::text[]),
  ('products', 'products', true, 102400, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('storefronts', 'storefronts', true, 512000, ARRAY['image/jpeg', 'image/png']::text[]),
  ('brand-assets', 'brand-assets', true, 512000, ARRAY['image/jpeg', 'image/png']::text[]),
  ('sponsored-products', 'sponsored-products', true, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('featured-city-banners', 'featured-city-banners', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('shops-banner-storage', 'shops-banner-storage', true, 204800, ARRAY['image/jpeg', 'image/png']::text[]),
  ('id-documents', 'id-documents', false, 512000, ARRAY['image/jpeg', 'image/png', 'application/pdf']::text[]),
  ('cac-documents', 'cac-documents', false, 512000, ARRAY['image/jpeg', 'image/png', 'application/pdf']::text[]),
  ('kyc-videos', 'kyc-videos', false, 10485760, ARRAY['video/mp4', 'video/webm']::text[]),
  ('kyc_videos', 'kyc_videos', false, 10485760, ARRAY['video/mp4', 'video/webm']::text[]),
  ('payment-receipts', 'payment-receipts', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[])
ON CONFLICT (id) DO UPDATE
SET
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "CTM public asset insert" ON storage.objects;
DROP POLICY IF EXISTS "CTM public asset update" ON storage.objects;
DROP POLICY IF EXISTS "CTM public asset delete" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Storefronts" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Storefronts" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update Storefronts" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete Storefronts" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Brand Assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Brand Assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update Brand Assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete Brand Assets" ON storage.objects;
DROP POLICY IF EXISTS "Owner Read ID" ON storage.objects;
DROP POLICY IF EXISTS "Owner Upload ID" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete ID" ON storage.objects;
DROP POLICY IF EXISTS "Owner Read CAC" ON storage.objects;
DROP POLICY IF EXISTS "Owner Upload CAC" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete CAC" ON storage.objects;
DROP POLICY IF EXISTS "Owner Read KYC Video" ON storage.objects;
DROP POLICY IF EXISTS "Owner Upload KYC Video" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete KYC Video" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view any file" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Promos" ON storage.objects;
DROP POLICY IF EXISTS "Public View Promos" ON storage.objects;
DROP POLICY IF EXISTS "Upload Own KYC" ON storage.objects;
DROP POLICY IF EXISTS "View Own KYC" ON storage.objects;
DROP POLICY IF EXISTS "Promo: Admin Insert" ON storage.objects;
DROP POLICY IF EXISTS "Promo: Admin Update" ON storage.objects;
DROP POLICY IF EXISTS "Promo: Admin Delete" ON storage.objects;
DROP POLICY IF EXISTS "CTM merchant public asset read" ON storage.objects;
DROP POLICY IF EXISTS "CTM merchant public asset insert" ON storage.objects;
DROP POLICY IF EXISTS "CTM merchant public asset update" ON storage.objects;
DROP POLICY IF EXISTS "CTM merchant public asset delete" ON storage.objects;
DROP POLICY IF EXISTS "CTM staff public asset read" ON storage.objects;
DROP POLICY IF EXISTS "CTM staff public asset insert" ON storage.objects;
DROP POLICY IF EXISTS "CTM staff public asset update" ON storage.objects;
DROP POLICY IF EXISTS "CTM staff public asset delete" ON storage.objects;

CREATE POLICY "CTM merchant public asset read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id IN ('avatars', 'products', 'storefronts', 'brand-assets', 'shops-banner-storage')
  AND public.ctm_storage_object_owned_by_current_user(bucket_id, name)
);

CREATE POLICY "CTM merchant public asset insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('avatars', 'products', 'storefronts', 'brand-assets', 'shops-banner-storage')
  AND public.ctm_storage_object_owned_by_current_user(bucket_id, name)
);

CREATE POLICY "CTM merchant public asset update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('avatars', 'products', 'storefronts', 'brand-assets', 'shops-banner-storage')
  AND public.ctm_storage_object_owned_by_current_user(bucket_id, name)
)
WITH CHECK (
  bucket_id IN ('avatars', 'products', 'storefronts', 'brand-assets', 'shops-banner-storage')
  AND public.ctm_storage_object_owned_by_current_user(bucket_id, name)
);

CREATE POLICY "CTM merchant public asset delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN ('avatars', 'products', 'storefronts', 'brand-assets', 'shops-banner-storage')
  AND public.ctm_storage_object_owned_by_current_user(bucket_id, name)
);

CREATE POLICY "CTM staff public asset read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  (
    bucket_id = 'featured-city-banners'
    AND (
      public.ctm_has_super_staff_access()
      OR (
        public.get_admin_role() = 'city_admin'::public.admin_role
        AND public.get_admin_city() IS NOT NULL
        AND name LIKE ('city-' || public.get_admin_city()::text || '/%')
      )
    )
  )
  OR (
    bucket_id = 'sponsored-products'
    AND public.ctm_has_staff_access()
  )
);

CREATE POLICY "CTM staff public asset insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  (
    bucket_id = 'featured-city-banners'
    AND (
      public.ctm_has_super_staff_access()
      OR (
        public.get_admin_role() = 'city_admin'::public.admin_role
        AND public.get_admin_city() IS NOT NULL
        AND name LIKE ('city-' || public.get_admin_city()::text || '/%')
      )
    )
  )
  OR (
    bucket_id = 'sponsored-products'
    AND public.ctm_has_staff_access()
  )
);

CREATE POLICY "CTM staff public asset update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  (
    bucket_id = 'featured-city-banners'
    AND (
      public.ctm_has_super_staff_access()
      OR (
        public.get_admin_role() = 'city_admin'::public.admin_role
        AND public.get_admin_city() IS NOT NULL
        AND name LIKE ('city-' || public.get_admin_city()::text || '/%')
      )
    )
  )
  OR (
    bucket_id = 'sponsored-products'
    AND public.ctm_has_staff_access()
  )
)
WITH CHECK (
  (
    bucket_id = 'featured-city-banners'
    AND (
      public.ctm_has_super_staff_access()
      OR (
        public.get_admin_role() = 'city_admin'::public.admin_role
        AND public.get_admin_city() IS NOT NULL
        AND name LIKE ('city-' || public.get_admin_city()::text || '/%')
      )
    )
  )
  OR (
    bucket_id = 'sponsored-products'
    AND public.ctm_has_staff_access()
  )
);

CREATE POLICY "CTM staff public asset delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  (
    bucket_id = 'featured-city-banners'
    AND (
      public.ctm_has_super_staff_access()
      OR (
        public.get_admin_role() = 'city_admin'::public.admin_role
        AND public.get_admin_city() IS NOT NULL
        AND name LIKE ('city-' || public.get_admin_city()::text || '/%')
      )
    )
  )
  OR (
    bucket_id = 'sponsored-products'
    AND public.ctm_has_staff_access()
  )
);
