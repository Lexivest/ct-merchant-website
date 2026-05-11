-- Shop banners/news are merchant submissions plus staff moderation state.
-- Keep merchant ownership and moderation status enforced in the database, not
-- just in the dashboard UI.

UPDATE public.shop_banners_news
SET
  content_type = lower(trim(content_type)),
  content_data = trim(content_data),
  status = coalesce(nullif(lower(trim(status)), ''), 'pending')
WHERE
  content_type IS DISTINCT FROM lower(trim(content_type))
  OR content_data IS DISTINCT FROM trim(content_data)
  OR status IS NULL
  OR status IS DISTINCT FROM lower(trim(status));

ALTER TABLE public.shop_banners_news
  ALTER COLUMN shop_id SET NOT NULL,
  ALTER COLUMN merchant_id SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.shop_banners_news
  DROP CONSTRAINT IF EXISTS shop_banners_news_content_type_check,
  DROP CONSTRAINT IF EXISTS shop_banners_news_status_check,
  DROP CONSTRAINT IF EXISTS shop_banners_news_content_data_check;

ALTER TABLE public.shop_banners_news
  ADD CONSTRAINT shop_banners_news_content_type_check
    CHECK (content_type IN ('banner', 'news')) NOT VALID,
  ADD CONSTRAINT shop_banners_news_status_check
    CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID,
  ADD CONSTRAINT shop_banners_news_content_data_check
    CHECK (length(trim(content_data)) > 0) NOT VALID;

ALTER TABLE public.shop_banners_news VALIDATE CONSTRAINT shop_banners_news_content_type_check;
ALTER TABLE public.shop_banners_news VALIDATE CONSTRAINT shop_banners_news_status_check;
ALTER TABLE public.shop_banners_news VALIDATE CONSTRAINT shop_banners_news_content_data_check;

CREATE OR REPLACE FUNCTION public.protect_banner_news_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_is_service_role boolean := coalesce((SELECT auth.role()), '') = 'service_role';
  v_requested_status text;
  v_shop_owner_id uuid;
  v_shop_city_id bigint;
  v_shop_is_active boolean := false;
  v_can_moderate boolean := false;
  v_is_owner boolean := false;
  v_content_changed boolean := false;
BEGIN
  IF v_is_service_role THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.shop_id := OLD.shop_id;
    NEW.merchant_id := OLD.merchant_id;
    NEW.content_type := OLD.content_type;
  END IF;

  NEW.content_type := lower(trim(coalesce(NEW.content_type, '')));
  NEW.content_data := trim(coalesce(NEW.content_data, ''));
  v_requested_status := lower(trim(coalesce(NEW.status, 'pending')));

  IF NEW.shop_id IS NULL OR NEW.merchant_id IS NULL THEN
    RAISE EXCEPTION 'Shop banner/news rows must be tied to a shop and merchant.'
      USING ERRCODE = '23502';
  END IF;

  SELECT
    s.owner_id,
    s.city_id,
    (
      s.status = 'approved'::public.application_status
      AND s.is_verified = true
      AND s.is_open = true
      AND s.subscription_end_date > now()
      AND EXISTS (
        SELECT 1
        FROM public.cities c
        WHERE c.id = s.city_id
          AND c.is_open = true
      )
    )
  INTO v_shop_owner_id, v_shop_city_id, v_shop_is_active
  FROM public.shops s
  WHERE s.id = NEW.shop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop banner/news rows must reference an existing shop.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.merchant_id IS DISTINCT FROM v_shop_owner_id THEN
    RAISE EXCEPTION 'Shop banner/news merchant must match the shop owner.'
      USING ERRCODE = '42501';
  END IF;

  v_is_owner := v_actor_id IS NOT NULL AND v_actor_id = v_shop_owner_id;
  v_can_moderate :=
    coalesce(public.ctm_has_super_staff_access(), false)
    OR (
      coalesce(public.ctm_has_staff_access(), false)
      AND v_shop_city_id = public.ctm_current_staff_city_scope()
    );

  IF NEW.content_type NOT IN ('banner', 'news') THEN
    RAISE EXCEPTION 'Invalid shop content type: %', NEW.content_type
      USING ERRCODE = '23514';
  END IF;

  IF NEW.content_data = '' THEN
    RAISE EXCEPTION 'Shop content cannot be empty.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.content_type = 'news' AND length(NEW.content_data) > 150 THEN
    RAISE EXCEPTION 'Shop news cannot exceed 150 characters.'
      USING ERRCODE = '22001';
  END IF;

  IF NEW.content_type = 'banner'
    AND NEW.content_data NOT LIKE (
      '%/storage/v1/object/public/shops-banner-storage/' || NEW.shop_id::text || '/%'
    )
  THEN
    RAISE EXCEPTION 'Shop banner must reference this shop''s banner storage folder.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_can_moderate THEN
      NEW.status := v_requested_status;

      IF NEW.status NOT IN ('pending', 'approved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid shop content status: %', NEW.status
          USING ERRCODE = '23514';
      END IF;
    ELSE
      IF NOT v_is_owner THEN
        RAISE EXCEPTION 'Only the shop owner or scoped staff can create shop content.'
          USING ERRCODE = '42501';
      END IF;

      IF NOT v_shop_is_active THEN
        RAISE EXCEPTION 'Shop content can only be submitted for active approved shops.'
          USING ERRCODE = '42501';
      END IF;

      NEW.status := 'pending';
    END IF;

    RETURN NEW;
  END IF;

  v_content_changed := NEW.content_data IS DISTINCT FROM trim(coalesce(OLD.content_data, ''));

  IF v_can_moderate THEN
    NEW.status := v_requested_status;

    IF NEW.status NOT IN ('pending', 'approved', 'rejected') THEN
      RAISE EXCEPTION 'Invalid shop content status: %', NEW.status
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'Only the shop owner or scoped staff can update shop content.'
        USING ERRCODE = '42501';
    END IF;

    IF v_content_changed THEN
      IF NOT v_shop_is_active THEN
        RAISE EXCEPTION 'Shop content can only be updated for active approved shops.'
          USING ERRCODE = '42501';
      END IF;

      NEW.status := 'pending';
    ELSE
      NEW.status := OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_banner_news_admin_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_banner_news_admin_columns() TO service_role;

DROP TRIGGER IF EXISTS enforce_banner_news_admin_columns ON public.shop_banners_news;

CREATE TRIGGER enforce_banner_news_admin_columns
BEFORE INSERT OR UPDATE ON public.shop_banners_news
FOR EACH ROW
EXECUTE FUNCTION public.protect_banner_news_admin_columns();

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
  (
    status = 'approved'
    AND EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id = shop_banners_news.shop_id
        AND s.status = 'approved'::public.application_status
        AND s.is_verified = true
        AND s.is_open = true
        AND s.subscription_end_date > now()
        AND EXISTS (
          SELECT 1
          FROM public.cities c
          WHERE c.id = s.city_id
            AND c.is_open = true
        )
    )
  )
  OR merchant_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = shop_banners_news.shop_id
      AND (
        (SELECT public.ctm_has_super_staff_access())
        OR (
          (SELECT public.ctm_has_staff_access())
          AND s.city_id = (SELECT public.ctm_current_staff_city_scope())
        )
      )
  )
);

CREATE POLICY "CTM shop content insert"
ON public.shop_banners_news
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = shop_banners_news.shop_id
      AND s.owner_id = shop_banners_news.merchant_id
      AND (
        (
          s.owner_id = (SELECT auth.uid())
          AND s.status = 'approved'::public.application_status
          AND s.is_verified = true
          AND s.is_open = true
          AND s.subscription_end_date > now()
          AND EXISTS (
            SELECT 1
            FROM public.cities c
            WHERE c.id = s.city_id
              AND c.is_open = true
          )
        )
        OR (SELECT public.ctm_has_super_staff_access())
        OR (
          (SELECT public.ctm_has_staff_access())
          AND s.city_id = (SELECT public.ctm_current_staff_city_scope())
        )
      )
  )
);

CREATE POLICY "CTM shop content update"
ON public.shop_banners_news
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = shop_banners_news.shop_id
      AND s.owner_id = shop_banners_news.merchant_id
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
    WHERE s.id = shop_banners_news.shop_id
      AND s.owner_id = shop_banners_news.merchant_id
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

CREATE POLICY "CTM shop content delete"
ON public.shop_banners_news
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = shop_banners_news.shop_id
      AND s.owner_id = shop_banners_news.merchant_id
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
