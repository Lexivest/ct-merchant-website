-- Add is_suspended column to shops table and enforce it in RLS policies.
-- Suspended shops (is_suspended = true) are invisible to the public but remain
-- visible to their owner and to staff/admins for management purposes.

-- 1. Add column
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- 2. Index — fast filter for the common case (most shops are not suspended)
CREATE INDEX IF NOT EXISTS ctm_shops_is_suspended_idx
  ON public.shops (is_suspended)
  WHERE is_suspended = true;

-- 3. Rebuild "CTM shops select" — add is_suspended = false to the public branch
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
    AND is_suspended = false
    AND subscription_end_date > now()
    AND EXISTS (
      SELECT 1
      FROM public.cities c
      WHERE c.id = shops.city_id
        AND c.is_open = true
    )
  )
);

-- 4. Rebuild "CTM products select" — add s.is_suspended = false to the public branch
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
          AND s.is_suspended = false
          AND s.subscription_end_date > now()
        )
      )
  )
);
