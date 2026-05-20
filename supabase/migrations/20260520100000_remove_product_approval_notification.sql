-- Remove push notification on product approval.
-- Approvals now reflect silently (status visible in merchant dashboard).
-- Rejections still fire a notification so vendors know to take action.

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
