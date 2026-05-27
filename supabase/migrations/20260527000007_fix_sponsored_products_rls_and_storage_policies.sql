-- ─────────────────────────────────────────────────────────────────────────────
-- Fix two issues found during production review:
--
-- 1. sponsored_products SELECT policy leaks paused records
--    The "CTM sponsored products select" policy had a third OR branch:
--      (is_active = true) AND (city_id IN (user's city))
--    Because is_active defaults to TRUE, a just-inserted sponsorship with
--    status = 'paused' (hidden until images are attached) was still visible
--    to any authenticated user in the same city.
--    Fix: replace with the same two-policy pattern used for flash_sales and
--    ticker_messages — anon sees published only; authenticated sees published
--    OR staff bypass.
--
-- 2. sponsored-display-images storage policies use TO PUBLIC
--    The INSERT / UPDATE / DELETE policies on storage.objects for this bucket
--    were scoped to PUBLIC (all roles), meaning even anon requests evaluated
--    ctm_has_staff_access(). Scope them to authenticated instead.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Fix sponsored_products SELECT ─────────────────────────────────────────

DROP POLICY IF EXISTS "CTM sponsored products select" ON public.sponsored_products;

-- Unauthenticated visitors: only published sponsored products
CREATE POLICY "sponsored_products_anon_select"
  ON public.sponsored_products FOR SELECT
  TO anon
  USING (status = 'published');

-- Authenticated users: published, OR staff can see all (incl. paused/drafts)
CREATE POLICY "sponsored_products_authenticated_select"
  ON public.sponsored_products FOR SELECT
  TO authenticated
  USING (status = 'published' OR public.ctm_has_staff_access());


-- ── 2. Tighten storage policies to authenticated ──────────────────────────────

DROP POLICY IF EXISTS "sponsored_display_images_staff_insert" ON storage.objects;
DROP POLICY IF EXISTS "sponsored_display_images_staff_update" ON storage.objects;
DROP POLICY IF EXISTS "sponsored_display_images_staff_delete" ON storage.objects;

CREATE POLICY "sponsored_display_images_staff_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sponsored-display-images'
    AND public.ctm_has_staff_access()
  );

CREATE POLICY "sponsored_display_images_staff_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'sponsored-display-images'
    AND public.ctm_has_staff_access()
  );

CREATE POLICY "sponsored_display_images_staff_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'sponsored-display-images'
    AND public.ctm_has_staff_access()
  );
