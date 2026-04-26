-- Pass 3: core marketplace RLS and index cleanup.
-- Goal: preserve current business rules while reducing repeated auth/admin
-- evaluation and fixing one overly-loose shop comment product check.

CREATE OR REPLACE FUNCTION public.is_staff_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_staff_member();
$$;

CREATE OR REPLACE FUNCTION public.ctm_staff_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sp.role
  FROM public.staff_profiles sp
  WHERE sp.id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ctm_staff_city_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sp.city_id
  FROM public.staff_profiles sp
  WHERE sp.id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ctm_has_staff_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT public.get_admin_role()) IS NOT NULL
    OR (SELECT public.is_staff_member());
$$;

CREATE OR REPLACE FUNCTION public.ctm_has_super_staff_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT public.get_admin_role()) = 'super_admin'::admin_role
    OR (SELECT public.ctm_staff_role()) = 'super_admin';
$$;

CREATE OR REPLACE FUNCTION public.ctm_current_staff_city_scope()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT public.get_admin_city()),
    (SELECT public.ctm_staff_city_id())
  );
$$;

REVOKE ALL ON FUNCTION public.ctm_staff_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_staff_city_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_has_staff_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_has_super_staff_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_current_staff_city_scope() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ctm_staff_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_staff_city_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_has_staff_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_has_super_staff_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_current_staff_city_scope() TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS ctm_shops_owner_idx
  ON public.shops (owner_id);

CREATE INDEX IF NOT EXISTS ctm_shops_city_status_idx
  ON public.shops (city_id, status, is_verified, is_open, subscription_end_date);

CREATE INDEX IF NOT EXISTS ctm_products_shop_visibility_idx
  ON public.products (shop_id, is_approved, is_available);

CREATE INDEX IF NOT EXISTS ctm_products_category_idx
  ON public.products (category);

CREATE INDEX IF NOT EXISTS ctm_shop_banners_news_shop_type_status_idx
  ON public.shop_banners_news (shop_id, content_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ctm_shop_banners_news_merchant_idx
  ON public.shop_banners_news (merchant_id);

CREATE INDEX IF NOT EXISTS ctm_shop_comments_shop_status_created_idx
  ON public.shop_comments (shop_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ctm_shop_comments_user_idx
  ON public.shop_comments (user_id);

CREATE INDEX IF NOT EXISTS ctm_shop_comments_parent_idx
  ON public.shop_comments (parent_id);

CREATE INDEX IF NOT EXISTS ctm_shop_comments_product_idx
  ON public.shop_comments (product_id);

CREATE INDEX IF NOT EXISTS ctm_wishlist_user_product_idx
  ON public.wishlist (user_id, product_id);

CREATE INDEX IF NOT EXISTS ctm_sponsored_products_city_status_idx
  ON public.sponsored_products (city_id, status, is_active, sort_order);

CREATE INDEX IF NOT EXISTS ctm_featured_city_banners_city_status_idx
  ON public.featured_city_banners (city_id, status, sort_order);

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Unified Shop Delete" ON public.shops;
DROP POLICY IF EXISTS "Unified Shop Insert" ON public.shops;
DROP POLICY IF EXISTS "Unified Shop Select" ON public.shops;
DROP POLICY IF EXISTS "Unified Shop Update" ON public.shops;
DROP POLICY IF EXISTS "CTM shops delete" ON public.shops;
DROP POLICY IF EXISTS "CTM shops insert" ON public.shops;
DROP POLICY IF EXISTS "CTM shops select" ON public.shops;
DROP POLICY IF EXISTS "CTM shops update" ON public.shops;

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

CREATE POLICY "CTM shops insert"
ON public.shops
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = (SELECT auth.uid())
  OR (SELECT public.ctm_has_staff_access())
);

CREATE POLICY "CTM shops update"
ON public.shops
FOR UPDATE
TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  OR (SELECT public.ctm_has_super_staff_access())
  OR (
    (SELECT public.ctm_has_staff_access())
    AND city_id = (SELECT public.ctm_current_staff_city_scope())
  )
)
WITH CHECK (
  owner_id = (SELECT auth.uid())
  OR (SELECT public.ctm_has_super_staff_access())
  OR (
    (SELECT public.ctm_has_staff_access())
    AND city_id = (SELECT public.ctm_current_staff_city_scope())
  )
);

CREATE POLICY "CTM shops delete"
ON public.shops
FOR DELETE
TO authenticated
USING ((SELECT public.ctm_has_super_staff_access()));

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Unified Product Delete" ON public.products;
DROP POLICY IF EXISTS "Unified Product Update" ON public.products;
DROP POLICY IF EXISTS "Unified Product View" ON public.products;
DROP POLICY IF EXISTS "Users can create products for their shop" ON public.products;
DROP POLICY IF EXISTS "CTM products delete" ON public.products;
DROP POLICY IF EXISTS "CTM products insert" ON public.products;
DROP POLICY IF EXISTS "CTM products select" ON public.products;
DROP POLICY IF EXISTS "CTM products update" ON public.products;

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

CREATE POLICY "CTM products insert"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = products.shop_id
      AND (
        (
          s.owner_id = (SELECT auth.uid())
          AND s.subscription_end_date > now()
        )
        OR (SELECT public.ctm_has_super_staff_access())
        OR (
          (SELECT public.ctm_has_staff_access())
          AND s.city_id = (SELECT public.ctm_current_staff_city_scope())
        )
      )
  )
);

CREATE POLICY "CTM products update"
ON public.products
FOR UPDATE
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
      )
  )
)
WITH CHECK (
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
      )
  )
);

CREATE POLICY "CTM products delete"
ON public.products
FOR DELETE
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
      )
  )
);

ALTER TABLE public.shop_banners_news ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Unified delete policy" ON public.shop_banners_news;
DROP POLICY IF EXISTS "Unified insert policy" ON public.shop_banners_news;
DROP POLICY IF EXISTS "Unified select policy" ON public.shop_banners_news;
DROP POLICY IF EXISTS "Unified update policy" ON public.shop_banners_news;
DROP POLICY IF EXISTS "CTM shop content delete" ON public.shop_banners_news;
DROP POLICY IF EXISTS "CTM shop content insert" ON public.shop_banners_news;
DROP POLICY IF EXISTS "CTM shop content select" ON public.shop_banners_news;
DROP POLICY IF EXISTS "CTM shop content update" ON public.shop_banners_news;

CREATE POLICY "CTM shop content select"
ON public.shop_banners_news
FOR SELECT
TO public
USING (
  status = 'approved'
  OR merchant_id = (SELECT auth.uid())
  OR (SELECT public.ctm_has_staff_access())
);

CREATE POLICY "CTM shop content insert"
ON public.shop_banners_news
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.ctm_has_staff_access())
  OR (
    merchant_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id = shop_banners_news.shop_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
);

CREATE POLICY "CTM shop content update"
ON public.shop_banners_news
FOR UPDATE
TO authenticated
USING (
  (SELECT public.ctm_has_staff_access())
  OR (
    merchant_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id = shop_banners_news.shop_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
)
WITH CHECK (
  (SELECT public.ctm_has_staff_access())
  OR (
    merchant_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id = shop_banners_news.shop_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
);

CREATE POLICY "CTM shop content delete"
ON public.shop_banners_news
FOR DELETE
TO authenticated
USING (
  (SELECT public.ctm_has_staff_access())
  OR (
    merchant_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id = shop_banners_news.shop_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
);

ALTER TABLE public.shop_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_comments_delete_staff" ON public.shop_comments;
DROP POLICY IF EXISTS "shop_comments_insert_authenticated" ON public.shop_comments;
DROP POLICY IF EXISTS "shop_comments_read_approved_public" ON public.shop_comments;
DROP POLICY IF EXISTS "shop_comments_read_authenticated" ON public.shop_comments;
DROP POLICY IF EXISTS "shop_comments_update_staff" ON public.shop_comments;
DROP POLICY IF EXISTS "CTM shop comments delete" ON public.shop_comments;
DROP POLICY IF EXISTS "CTM shop comments insert" ON public.shop_comments;
DROP POLICY IF EXISTS "CTM shop comments select" ON public.shop_comments;
DROP POLICY IF EXISTS "CTM shop comments update" ON public.shop_comments;

CREATE POLICY "CTM shop comments select"
ON public.shop_comments
FOR SELECT
TO public
USING (
  status = 'approved'
  OR user_id = (SELECT auth.uid())
  OR (SELECT public.ctm_has_staff_access())
);

CREATE POLICY "CTM shop comments insert"
ON public.shop_comments
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = shop_comments.shop_id
  )
  AND (
    product_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = shop_comments.product_id
        AND p.shop_id = shop_comments.shop_id
    )
  )
  AND (
    parent_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.shop_comments parent
      WHERE parent.id = shop_comments.parent_id
        AND parent.shop_id = shop_comments.shop_id
    )
  )
);

CREATE POLICY "CTM shop comments update"
ON public.shop_comments
FOR UPDATE
TO authenticated
USING ((SELECT public.ctm_has_staff_access()))
WITH CHECK ((SELECT public.ctm_has_staff_access()));

CREATE POLICY "CTM shop comments delete"
ON public.shop_comments
FOR DELETE
TO authenticated
USING ((SELECT public.ctm_has_staff_access()));

ALTER TABLE public.sponsored_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins and staff can insert sponsored products" ON public.sponsored_products;
DROP POLICY IF EXISTS "Admins delete promo banners" ON public.sponsored_products;
DROP POLICY IF EXISTS "Admins update promo banners" ON public.sponsored_products;
DROP POLICY IF EXISTS "Unified read access for sponsored products" ON public.sponsored_products;
DROP POLICY IF EXISTS "CTM sponsored products delete" ON public.sponsored_products;
DROP POLICY IF EXISTS "CTM sponsored products insert" ON public.sponsored_products;
DROP POLICY IF EXISTS "CTM sponsored products select" ON public.sponsored_products;
DROP POLICY IF EXISTS "CTM sponsored products update" ON public.sponsored_products;

CREATE POLICY "CTM sponsored products select"
ON public.sponsored_products
FOR SELECT
TO public
USING (
  status = 'published'
  OR (SELECT public.ctm_has_staff_access())
  OR (
    is_active = true
    AND city_id IN (
      SELECT p.city_id
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
    )
  )
);

CREATE POLICY "CTM sponsored products insert"
ON public.sponsored_products
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.ctm_has_staff_access()));

CREATE POLICY "CTM sponsored products update"
ON public.sponsored_products
FOR UPDATE
TO authenticated
USING ((SELECT public.ctm_has_staff_access()))
WITH CHECK ((SELECT public.ctm_has_staff_access()));

CREATE POLICY "CTM sponsored products delete"
ON public.sponsored_products
FOR DELETE
TO authenticated
USING ((SELECT public.ctm_has_staff_access()));

ALTER TABLE public.featured_city_banners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read active featured city banners" ON public.featured_city_banners;
DROP POLICY IF EXISTS "Staff can create featured city banners" ON public.featured_city_banners;
DROP POLICY IF EXISTS "Staff can delete featured city banners" ON public.featured_city_banners;
DROP POLICY IF EXISTS "Staff can update featured city banners" ON public.featured_city_banners;
DROP POLICY IF EXISTS "CTM featured city banners delete" ON public.featured_city_banners;
DROP POLICY IF EXISTS "CTM featured city banners insert" ON public.featured_city_banners;
DROP POLICY IF EXISTS "CTM featured city banners select" ON public.featured_city_banners;
DROP POLICY IF EXISTS "CTM featured city banners update" ON public.featured_city_banners;

CREATE POLICY "CTM featured city banners select"
ON public.featured_city_banners
FOR SELECT
TO authenticated
USING (
  (
    status = 'published'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  )
  OR (SELECT public.ctm_has_staff_access())
);

CREATE POLICY "CTM featured city banners insert"
ON public.featured_city_banners
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.ctm_has_staff_access()));

CREATE POLICY "CTM featured city banners update"
ON public.featured_city_banners
FOR UPDATE
TO authenticated
USING ((SELECT public.ctm_has_staff_access()))
WITH CHECK ((SELECT public.ctm_has_staff_access()));

CREATE POLICY "CTM featured city banners delete"
ON public.featured_city_banners
FOR DELETE
TO authenticated
USING ((SELECT public.ctm_has_staff_access()));

ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own wishlist" ON public.wishlist;
DROP POLICY IF EXISTS "CTM wishlist manage" ON public.wishlist;

CREATE POLICY "CTM wishlist manage"
ON public.wishlist
FOR ALL
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));
