-- Revert 20260526000001: remove is_suspended from shops.
-- The is_open flag (merchant-controlled) already covers the close-shop use case.

-- 1. Revert "CTM shops select" — remove is_suspended = false condition
DROP POLICY IF EXISTS "CTM shops select" ON public.shops;

CREATE POLICY "CTM shops select"
ON public.shops
FOR SELECT
TO public
USING (
  owner_id = (SELECT auth.uid())
  OR (SELECT public.ctm_has_super_staff_access())
  OR (
    (SELECT public.ctm_has_staff_access())
    AND city_id = (SELECT public.ctm_current_staff_city_scope())
  )
  OR (
    status = 'approved'::application_status
    AND is_verified = true
    AND is_open = true
    AND subscription_end_date > now()
    AND EXISTS (
      SELECT 1
      FROM public.cities c
      WHERE c.id = shops.city_id
        AND c.is_open = true
    )
  )
);

-- 2. Revert "CTM products select" — remove s.is_suspended = false condition
DROP POLICY IF EXISTS "CTM products select" ON public.products;

CREATE POLICY "CTM products select"
ON public.products
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = products.shop_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR (SELECT public.ctm_has_super_staff_access())
        OR (
          (SELECT public.ctm_has_staff_access())
          AND s.city_id = (SELECT public.ctm_current_staff_city_scope())
        )
        OR (
          products.is_approved = true
          AND s.status = 'approved'::application_status
          AND s.is_open = true
          AND s.subscription_end_date > now()
        )
      )
  )
);

-- 3. Drop index then column
DROP INDEX IF EXISTS public.ctm_shops_is_suspended_idx;

ALTER TABLE public.shops
  DROP COLUMN IF EXISTS is_suspended;
