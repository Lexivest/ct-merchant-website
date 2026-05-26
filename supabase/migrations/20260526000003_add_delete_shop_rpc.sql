-- Super-admin-only RPC to completely delete a shop and all its associated data.
-- Profiles and financial payment records (physical_verification_payments) are preserved.
--
-- Deletion order (respects FK constraints):
--   1. whatsapp_clicks       — NO ACTION FK on both shop_id and product_id
--   2. shop_likes            — NO ACTION FK on shop_id
--   3. service_fee_payments  — no FK constraint at all (orphan cleanup)
--   4. sponsored_products    — SET NULL would leave orphans; explicit delete is cleaner
--   5. products              — NO ACTION FK on shop_id; cascades: wishlist (CASCADE),
--                              nulls shop_analytics_events.product_id and shop_comments.product_id
--   6. shops                 — cascades: shop_banners_news, shop_comments, shop_analytics_events,
--                              offline_payment_proofs; SET NULL: physical_verification_payments,
--                              featured_city_banners

CREATE OR REPLACE FUNCTION public.ctm_delete_shop(p_shop_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_role text;
  v_shop_name  text;
  v_owner_id   uuid;
BEGIN
  -- Authorization: super_admin only
  v_admin_role := (SELECT public.get_admin_role())::text;
  IF v_admin_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized: only super admins can delete shops.';
  END IF;

  -- Fetch shop details before deletion (for the return payload)
  SELECT name, owner_id
  INTO v_shop_name, v_owner_id
  FROM public.shops
  WHERE id = p_shop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found: %', p_shop_id;
  END IF;

  -- Step 1: whatsapp_clicks
  -- Covers both FK paths: shop_id (NO ACTION from shops) and
  -- product_id (NO ACTION from products → must go before products delete)
  DELETE FROM public.whatsapp_clicks WHERE shop_id = p_shop_id;

  -- Step 2: shop_likes (NO ACTION FK from shops)
  DELETE FROM public.shop_likes WHERE shop_id = p_shop_id;

  -- Step 3: service_fee_payments (no FK constraint — prevents orphan rows)
  DELETE FROM public.service_fee_payments WHERE shop_id = p_shop_id;

  -- Step 4: sponsored_products
  -- FK is SET NULL, but orphan sponsored entries for a deleted shop are useless
  DELETE FROM public.sponsored_products WHERE shop_id = p_shop_id;

  -- Step 5: products
  -- Cascades: wishlist entries (CASCADE), nulls analytics/comment product_id refs (SET NULL)
  DELETE FROM public.products WHERE shop_id = p_shop_id;

  -- Step 6: shop — cascades the rest
  -- AUTO-CASCADE: shop_banners_news, shop_comments, shop_analytics_events, offline_payment_proofs, featured_city_banners
  -- SET NULL:     physical_verification_payments.shop_id (financial record preserved)
  DELETE FROM public.shops WHERE id = p_shop_id;

  RETURN jsonb_build_object(
    'success',           true,
    'deleted_shop_id',   p_shop_id,
    'deleted_shop_name', v_shop_name,
    'owner_id',          v_owner_id
  );
END;
$$;

-- Lock down access: only authenticated users can invoke, but the function
-- itself enforces super_admin check internally.
REVOKE ALL ON FUNCTION public.ctm_delete_shop(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_delete_shop(bigint) TO authenticated, service_role;
