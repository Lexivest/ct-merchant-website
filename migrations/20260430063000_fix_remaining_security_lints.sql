-- Clear remaining database security lints without breaking existing client RPCs.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- The helper only uses built-in text functions, so pinning pg_catalog removes
-- role-controlled search_path lookup risk.
CREATE OR REPLACE FUNCTION public.ctm_storage_path_from_url(
  p_url text,
  p_bucket_id text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  v_clean text;
  v_prefix text;
BEGIN
  IF p_url IS NULL OR p_url = '' THEN
    RETURN NULL;
  END IF;

  IF p_url NOT LIKE 'http%' THEN
    RETURN ltrim(p_url, '/');
  END IF;

  v_clean := split_part(p_url, '?', 1);

  v_prefix := '/storage/v1/object/public/' || p_bucket_id || '/';
  IF position(v_prefix IN v_clean) > 0 THEN
    RETURN split_part(v_clean, v_prefix, 2);
  END IF;

  v_prefix := '/storage/v1/object/authenticated/' || p_bucket_id || '/';
  IF position(v_prefix IN v_clean) > 0 THEN
    RETURN split_part(v_clean, v_prefix, 2);
  END IF;

  v_prefix := '/storage/v1/object/sign/' || p_bucket_id || '/';
  IF position(v_prefix IN v_clean) > 0 THEN
    RETURN split_part(v_clean, v_prefix, 2);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ctm_storage_path_from_url(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_storage_path_from_url(text, text) TO authenticated, service_role;

-- Keep the privileged product review implementation outside the exposed API
-- schema, then leave a public SECURITY INVOKER wrapper for the staff page RPC.
CREATE OR REPLACE FUNCTION private.review_product_submission(
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

REVOKE ALL ON FUNCTION private.review_product_submission(
  bigint,
  timestamp with time zone,
  text,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.review_product_submission(
  bigint,
  timestamp with time zone,
  text,
  text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_product_submission(
  p_product_id bigint,
  p_expected_updated_at timestamp with time zone,
  p_action text,
  p_rejection_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT private.review_product_submission(
    p_product_id,
    p_expected_updated_at,
    p_action,
    p_rejection_reason
  );
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
