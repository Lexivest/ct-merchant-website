-- Make product moderation version-aware and keep product table business rules
-- enforceable even when callers bypass the merchant/staff UI.

CREATE OR REPLACE FUNCTION public.protect_product_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_auth_uid uuid := (SELECT auth.uid());
  v_is_service_role boolean := coalesce((SELECT auth.role()), '') = 'service_role';
  v_can_moderate boolean := false;
  v_is_owner boolean := false;
  v_product_shop_id bigint;
  v_content_changed boolean := false;
  v_moderation_changed boolean := false;
  v_discount_count integer := 0;
  v_review_context text := current_setting('app.product_review_context', true);
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

  SELECT
    s.owner_id IS NOT DISTINCT FROM v_auth_uid,
    (
      public.ctm_has_super_staff_access()
      OR (
        public.ctm_has_admin_role()
        AND s.city_id = public.ctm_current_staff_city_scope()
      )
    )
  INTO v_is_owner, v_can_moderate
  FROM public.shops s
  WHERE s.id = v_product_shop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product shop not found.';
  END IF;

  IF NEW.price IS NULL OR NEW.price < 0 THEN
    RAISE EXCEPTION 'Product price must be zero or greater.';
  END IF;

  IF NEW.stock_count IS NULL OR NEW.stock_count < 0 THEN
    RAISE EXCEPTION 'Product stock count must be zero or greater.';
  END IF;

  IF NEW.discount_price IS NOT NULL THEN
    IF NEW.condition = 'Fairly Used' THEN
      RAISE EXCEPTION 'Fairly used products cannot use special-offer discounts.';
    END IF;

    IF NEW.discount_price <= 0
       OR NEW.discount_price >= NEW.price
       OR NEW.discount_price < (NEW.price * 0.8)
       OR NEW.discount_price > (NEW.price * 0.99) THEN
      RAISE EXCEPTION 'Product discount must be between 1 percent and 20 percent.';
    END IF;

    SELECT count(*)::integer
    INTO v_discount_count
    FROM public.products p
    WHERE p.shop_id = v_product_shop_id
      AND p.discount_price IS NOT NULL
      AND (TG_OP = 'INSERT' OR p.id <> OLD.id);

    IF v_discount_count >= 2 THEN
      RAISE EXCEPTION 'Special-offer limit reached for this shop.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_is_owner AND NOT v_can_moderate THEN
      IF (SELECT count(*) FROM public.products p WHERE p.shop_id = v_product_shop_id) >= 30 THEN
        RAISE EXCEPTION 'Product limit reached (max 30).';
      END IF;
    END IF;

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

  v_moderation_changed :=
    NEW.is_approved IS DISTINCT FROM OLD.is_approved
    OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason;

  IF v_can_moderate THEN
    IF v_moderation_changed AND v_review_context IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Product moderation must use the review workflow.';
    END IF;

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
GRANT EXECUTE ON FUNCTION public.protect_product_admin_columns() TO service_role;

DROP TRIGGER IF EXISTS enforce_product_admin_columns ON public.products;
DROP TRIGGER IF EXISTS protect_product_admin_columns ON public.products;
CREATE TRIGGER enforce_product_admin_columns
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.protect_product_admin_columns();

CREATE OR REPLACE FUNCTION public.review_product_submission(
  p_product_id bigint,
  p_expected_updated_at timestamp with time zone,
  p_action text,
  p_rejection_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_action text := lower(trim(coalesce(p_action, '')));
  v_reason text := left(trim(coalesce(p_rejection_reason, '')), 500);
  v_product record;
  v_reviewed public.products%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT p.*, s.owner_id, s.city_id, s.name AS shop_name
  INTO v_product
  FROM public.products p
  JOIN public.shops s ON s.id = p.shop_id
  WHERE p.id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  IF NOT (
    public.ctm_has_super_staff_access()
    OR (
      public.ctm_has_admin_role()
      AND v_product.city_id = public.ctm_current_staff_city_scope()
    )
  ) THEN
    RAISE EXCEPTION 'Product moderation access denied.' USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Refresh this product before reviewing it.';
  END IF;

  IF v_product.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Product changed after you opened it. Refresh and review the latest version.';
  END IF;

  PERFORM set_config('app.product_review_context', 'on', true);

  IF v_action = 'approve' THEN
    UPDATE public.products
    SET is_approved = true,
        rejection_reason = NULL,
        updated_at = now()
    WHERE id = p_product_id
    RETURNING * INTO v_reviewed;

    PERFORM public.push_user_notification(
      v_product.owner_id,
      'Product Approved',
      '"' || coalesce(v_product.name, 'Your product') || '" is now live in the marketplace.',
      'product_approved',
      '/merchant-products?shop_id=' || v_product.shop_id::text
    );
  ELSIF v_action = 'reject' THEN
    IF nullif(v_reason, '') IS NULL THEN
      RAISE EXCEPTION 'A rejection reason is required.';
    END IF;

    UPDATE public.products
    SET is_approved = false,
        rejection_reason = v_reason,
        updated_at = now()
    WHERE id = p_product_id
    RETURNING * INTO v_reviewed;

    PERFORM public.push_user_notification(
      v_product.owner_id,
      'Product Needs Attention',
      '"' || coalesce(v_product.name, 'Your product') || '" was not approved. Staff note: ' || v_reason,
      'product_rejected',
      '/merchant-edit-product?id=' || v_product.id::text
    );
  ELSE
    RAISE EXCEPTION 'Invalid product review action.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', CASE WHEN v_reviewed.is_approved THEN 'approved' ELSE 'rejected' END,
    'product', to_jsonb(v_reviewed)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_product_submission(
  bigint,
  timestamp with time zone,
  text,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_product_submission(
  bigint,
  timestamp with time zone,
  text,
  text
) TO authenticated, service_role;
