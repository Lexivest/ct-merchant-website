-- Harden storage metadata and remove stale write/read paths that survived older flows.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('kyc-videos', 'kyc-videos', false, 10485760, ARRAY['video/mp4', 'video/webm']::text[])
ON CONFLICT (id) DO UPDATE
SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm']::text[]
WHERE id = 'kyc_videos';

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 512000,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf']::text[]
WHERE id IN ('id-documents', 'cac-documents');

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
WHERE id = 'payment-receipts';

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 102400,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'products';

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 204800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png']::text[]
WHERE id = 'shops-banner-storage';

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 512000,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png']::text[]
WHERE id IN ('avatars', 'brand-assets', 'storefronts');

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'sponsored-products';

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'featured-city-banners';

-- Retire stale policies for buckets no longer used by the app and one broad
-- legacy admin policy that bypasses the staff_profiles login gate.
DROP POLICY IF EXISTS "Admins can view any file" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Promos" ON storage.objects;
DROP POLICY IF EXISTS "Public View Promos" ON storage.objects;
DROP POLICY IF EXISTS "Upload Own KYC" ON storage.objects;
DROP POLICY IF EXISTS "View Own KYC" ON storage.objects;
DROP POLICY IF EXISTS "Promo: Admin Insert" ON storage.objects;
DROP POLICY IF EXISTS "Promo: Admin Update" ON storage.objects;
DROP POLICY IF EXISTS "Promo: Admin Delete" ON storage.objects;

DROP POLICY IF EXISTS "CTM private asset read" ON storage.objects;
DROP POLICY IF EXISTS "CTM private asset insert" ON storage.objects;
DROP POLICY IF EXISTS "CTM private asset update" ON storage.objects;
DROP POLICY IF EXISTS "CTM private asset delete" ON storage.objects;

CREATE POLICY "CTM private asset read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  (
    bucket_id IN ('id-documents', 'cac-documents')
    AND (
      public.ctm_storage_object_owned_by_current_user(bucket_id, name)
      OR public.ctm_has_super_staff_access()
      OR (
        public.get_admin_role() = 'city_admin'::public.admin_role
        AND public.get_admin_city() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.shops s
          WHERE s.city_id = public.get_admin_city()
            AND (
              (
                bucket_id = 'id-documents'
                AND public.ctm_storage_path_from_url(s.id_card_url, bucket_id) = name
              )
              OR (
                bucket_id = 'cac-documents'
                AND public.ctm_storage_path_from_url(s.cac_certificate_url, bucket_id) = name
              )
            )
        )
      )
    )
  )
  OR (
    bucket_id IN ('kyc_videos', 'kyc-videos', 'payment-receipts')
    AND (
      public.ctm_storage_object_owned_by_current_user(bucket_id, name)
      OR public.ctm_has_super_staff_access()
    )
  )
);

CREATE POLICY "CTM private asset insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('id-documents', 'cac-documents', 'kyc_videos', 'kyc-videos', 'payment-receipts')
  AND public.ctm_storage_object_owned_by_current_user(bucket_id, name)
);

CREATE POLICY "CTM private asset update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('id-documents', 'cac-documents', 'kyc_videos', 'kyc-videos', 'payment-receipts')
  AND (
    public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    OR public.ctm_has_super_staff_access()
  )
)
WITH CHECK (
  bucket_id IN ('id-documents', 'cac-documents', 'kyc_videos', 'kyc-videos', 'payment-receipts')
  AND (
    public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    OR public.ctm_has_super_staff_access()
  )
);

CREATE POLICY "CTM private asset delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN ('id-documents', 'cac-documents', 'kyc_videos', 'kyc-videos', 'payment-receipts')
  AND (
    public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    OR public.ctm_has_super_staff_access()
  )
);

DROP POLICY IF EXISTS "CTM public asset insert" ON storage.objects;
DROP POLICY IF EXISTS "CTM public asset update" ON storage.objects;
DROP POLICY IF EXISTS "CTM public asset delete" ON storage.objects;
DROP POLICY IF EXISTS "CTM merchant public asset insert" ON storage.objects;
DROP POLICY IF EXISTS "CTM merchant public asset update" ON storage.objects;
DROP POLICY IF EXISTS "CTM merchant public asset delete" ON storage.objects;
DROP POLICY IF EXISTS "CTM staff public asset insert" ON storage.objects;
DROP POLICY IF EXISTS "CTM staff public asset update" ON storage.objects;
DROP POLICY IF EXISTS "CTM staff public asset delete" ON storage.objects;

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
