-- Pass 2: tighten storage access and consolidate high-traffic RLS policies.
-- Public buckets are still public for direct object reads, but they should not
-- expose SELECT policies that allow clients to enumerate every object.

CREATE OR REPLACE FUNCTION public.is_staff_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_profiles sp
    WHERE sp.id = (SELECT auth.uid())
  );
$$;

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
  v_uid text := (SELECT auth.uid())::text;
  v_first_segment text := split_part(coalesce(p_name, ''), '/', 1);
BEGIN
  IF v_uid IS NULL OR v_uid = '' OR p_name IS NULL OR p_name = '' THEN
    RETURN false;
  END IF;

  -- Current and future user-owned layouts:
  --   avatars/payment/KYC: <user_id>/...
  --   products/avatar legacy: <user_id>_...
  --   registration docs/assets: ids|cac|covers|logos/<user_id>_...
  IF p_name LIKE v_uid || '/%' THEN
    RETURN true;
  END IF;

  IF p_name LIKE v_uid || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'ids/' || v_uid || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'cac/' || v_uid || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'covers/' || v_uid || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'logos/' || v_uid || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  -- Merchant shop banners are stored by shop id, so ownership comes from shops.
  IF p_bucket_id = 'shops-banner-storage' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id::text = v_first_segment
        AND s.owner_id = (SELECT auth.uid())
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.ctm_storage_object_owned_by_current_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_storage_object_owned_by_current_user(text, text) TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('products', 'products', true),
  ('storefronts', 'storefronts', true),
  ('brand-assets', 'brand-assets', true),
  ('sponsored-products', 'sponsored-products', true),
  ('featured-city-banners', 'featured-city-banners', true),
  ('shops-banner-storage', 'shops-banner-storage', true),
  ('id-documents', 'id-documents', false),
  ('cac-documents', 'cac-documents', false),
  ('kyc_videos', 'kyc_videos', false),
  ('kyc-videos', 'kyc-videos', false),
  ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        coalesce(qual, '') ILIKE ANY (ARRAY[
          '%avatars%',
          '%products%',
          '%storefronts%',
          '%brand-assets%',
          '%sponsored-products%',
          '%featured-city-banners%',
          '%shops-banner-storage%',
          '%id-documents%',
          '%cac-documents%',
          '%kyc_videos%',
          '%kyc-videos%',
          '%payment-receipts%'
        ])
        OR coalesce(with_check, '') ILIKE ANY (ARRAY[
          '%avatars%',
          '%products%',
          '%storefronts%',
          '%brand-assets%',
          '%sponsored-products%',
          '%featured-city-banners%',
          '%shops-banner-storage%',
          '%id-documents%',
          '%cac-documents%',
          '%kyc_videos%',
          '%kyc-videos%',
          '%payment-receipts%'
        ])
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

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

CREATE POLICY "CTM public asset insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN (
    'avatars',
    'products',
    'storefronts',
    'brand-assets',
    'sponsored-products',
    'featured-city-banners',
    'shops-banner-storage'
  )
  AND (
    (SELECT public.is_staff_member())
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
);

CREATE POLICY "CTM public asset update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN (
    'avatars',
    'products',
    'storefronts',
    'brand-assets',
    'sponsored-products',
    'featured-city-banners',
    'shops-banner-storage'
  )
  AND (
    (SELECT public.is_staff_member())
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
)
WITH CHECK (
  bucket_id IN (
    'avatars',
    'products',
    'storefronts',
    'brand-assets',
    'sponsored-products',
    'featured-city-banners',
    'shops-banner-storage'
  )
  AND (
    (SELECT public.is_staff_member())
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
);

CREATE POLICY "CTM public asset delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN (
    'avatars',
    'products',
    'storefronts',
    'brand-assets',
    'sponsored-products',
    'featured-city-banners',
    'shops-banner-storage'
  )
  AND (
    (SELECT public.is_staff_member())
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
);

CREATE POLICY "CTM private asset read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id IN (
    'id-documents',
    'cac-documents',
    'kyc_videos',
    'kyc-videos',
    'payment-receipts'
  )
  AND (
    (SELECT public.is_staff_member())
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
);

CREATE POLICY "CTM private asset insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN (
    'id-documents',
    'cac-documents',
    'kyc_videos',
    'kyc-videos',
    'payment-receipts'
  )
  AND (
    (SELECT public.is_staff_member())
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
);

CREATE POLICY "CTM private asset update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN (
    'id-documents',
    'cac-documents',
    'kyc_videos',
    'kyc-videos',
    'payment-receipts'
  )
  AND (
    (SELECT public.is_staff_member())
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
)
WITH CHECK (
  bucket_id IN (
    'id-documents',
    'cac-documents',
    'kyc_videos',
    'kyc-videos',
    'payment-receipts'
  )
  AND (
    (SELECT public.is_staff_member())
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
);

CREATE POLICY "CTM private asset delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN (
    'id-documents',
    'cac-documents',
    'kyc_videos',
    'kyc-videos',
    'payment-receipts'
  )
  AND (
    (SELECT public.is_staff_member())
    OR public.ctm_storage_object_owned_by_current_user(bucket_id, name)
  )
);

DROP POLICY IF EXISTS "Authenticated can read relevant payment proofs" ON public.offline_payment_proofs;
DROP POLICY IF EXISTS "Merchants can read their own payment proofs" ON public.offline_payment_proofs;
DROP POLICY IF EXISTS "Staff can read payment proofs" ON public.offline_payment_proofs;
DROP POLICY IF EXISTS "Merchants can create their own payment proofs" ON public.offline_payment_proofs;

CREATE POLICY "CTM payment proofs read"
ON public.offline_payment_proofs
FOR SELECT
TO authenticated
USING (
  merchant_id = (SELECT auth.uid())
  OR (SELECT public.is_staff_member())
);

CREATE POLICY "CTM payment proofs insert"
ON public.offline_payment_proofs
FOR INSERT
TO authenticated
WITH CHECK (
  merchant_id = (SELECT auth.uid())
  AND status = 'pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = offline_payment_proofs.shop_id
      AND s.owner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Staff can delete discoveries" ON public.staff_discoveries;
DROP POLICY IF EXISTS "Staff can insert discoveries" ON public.staff_discoveries;
DROP POLICY IF EXISTS "Staff can update discoveries" ON public.staff_discoveries;
DROP POLICY IF EXISTS "Unified read access for discoveries" ON public.staff_discoveries;

CREATE POLICY "CTM discoveries delete"
ON public.staff_discoveries
FOR DELETE
TO authenticated
USING ((SELECT public.is_staff_member()));

CREATE POLICY "CTM discoveries insert"
ON public.staff_discoveries
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_staff_member()));

CREATE POLICY "CTM discoveries update"
ON public.staff_discoveries
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff_member()))
WITH CHECK ((SELECT public.is_staff_member()));

CREATE POLICY "CTM discoveries read"
ON public.staff_discoveries
FOR SELECT
TO public
USING (
  status = 'published'
  OR (SELECT public.is_staff_member())
);
