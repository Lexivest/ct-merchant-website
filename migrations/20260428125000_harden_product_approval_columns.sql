-- Product approval/rejection fields are staff moderation state. Merchants can
-- resubmit product content, but they cannot approve themselves or edit staff
-- rejection notes directly.

CREATE OR REPLACE FUNCTION public.protect_product_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_is_service_role boolean := coalesce((SELECT auth.role()), '') = 'service_role';
  v_can_moderate boolean := false;
  v_product_shop_id bigint;
  v_content_changed boolean := false;
BEGIN
  IF v_is_service_role THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.shop_id := OLD.shop_id;
    v_product_shop_id := OLD.shop_id;
  ELSE
    v_product_shop_id := NEW.shop_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = v_product_shop_id
      AND (
        public.ctm_has_super_staff_access()
        OR (
          public.ctm_has_staff_access()
          AND s.city_id = public.ctm_current_staff_city_scope()
        )
      )
  )
  INTO v_can_moderate;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_can_moderate THEN
      NEW.is_approved := false;
      NEW.rejection_reason := NULL;
    ELSIF NEW.is_approved THEN
      NEW.rejection_reason := NULL;
    END IF;

    RETURN NEW;
  END IF;

  v_content_changed :=
    NEW.name IS DISTINCT FROM OLD.name
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.price IS DISTINCT FROM OLD.price
    OR NEW.discount_price IS DISTINCT FROM OLD.discount_price
    OR NEW.condition IS DISTINCT FROM OLD.condition
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.image_url IS DISTINCT FROM OLD.image_url
    OR NEW.image_url_2 IS DISTINCT FROM OLD.image_url_2
    OR NEW.image_url_3 IS DISTINCT FROM OLD.image_url_3
    OR NEW.attributes IS DISTINCT FROM OLD.attributes;

  IF v_can_moderate THEN
    IF NEW.is_approved THEN
      NEW.rejection_reason := NULL;
    ELSIF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
      AND nullif(trim(coalesce(NEW.rejection_reason, '')), '') IS NOT NULL THEN
      NEW.is_approved := false;
      NEW.rejection_reason := left(trim(NEW.rejection_reason), 500);
    END IF;

    RETURN NEW;
  END IF;

  IF v_content_changed THEN
    NEW.is_approved := false;
    NEW.rejection_reason := NULL;
  ELSE
    NEW.is_approved := OLD.is_approved;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_product_admin_columns_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_is_service_role boolean := coalesce((SELECT auth.role()), '') = 'service_role';
  v_can_moderate boolean := false;
  v_product_shop_id bigint;
  v_content_changed boolean := false;
BEGIN
  IF v_is_service_role THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.shop_id := OLD.shop_id;
    v_product_shop_id := OLD.shop_id;
  ELSE
    v_product_shop_id := NEW.shop_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = v_product_shop_id
      AND (
        public.ctm_has_super_staff_access()
        OR (
          public.ctm_has_staff_access()
          AND s.city_id = public.ctm_current_staff_city_scope()
        )
      )
  )
  INTO v_can_moderate;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_can_moderate THEN
      NEW.is_approved := false;
      NEW.rejection_reason := NULL;
    ELSIF NEW.is_approved THEN
      NEW.rejection_reason := NULL;
    END IF;

    RETURN NEW;
  END IF;

  v_content_changed :=
    NEW.name IS DISTINCT FROM OLD.name
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.price IS DISTINCT FROM OLD.price
    OR NEW.discount_price IS DISTINCT FROM OLD.discount_price
    OR NEW.condition IS DISTINCT FROM OLD.condition
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.image_url IS DISTINCT FROM OLD.image_url
    OR NEW.image_url_2 IS DISTINCT FROM OLD.image_url_2
    OR NEW.image_url_3 IS DISTINCT FROM OLD.image_url_3
    OR NEW.attributes IS DISTINCT FROM OLD.attributes;

  IF v_can_moderate THEN
    IF NEW.is_approved THEN
      NEW.rejection_reason := NULL;
    ELSIF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
      AND nullif(trim(coalesce(NEW.rejection_reason, '')), '') IS NOT NULL THEN
      NEW.is_approved := false;
      NEW.rejection_reason := left(trim(NEW.rejection_reason), 500);
    END IF;

    RETURN NEW;
  END IF;

  IF v_content_changed THEN
    NEW.is_approved := false;
    NEW.rejection_reason := NULL;
  ELSE
    NEW.is_approved := OLD.is_approved;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_product_admin_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_product_admin_columns_updated() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_product_admin_columns() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_product_admin_columns_updated() TO service_role;

DROP TRIGGER IF EXISTS protect_product_admin_columns ON public.products;
DROP TRIGGER IF EXISTS enforce_product_admin_columns ON public.products;

CREATE TRIGGER enforce_product_admin_columns
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.protect_product_admin_columns();

