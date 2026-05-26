-- Patch both delete RPCs to handle storage cleanup.
--
-- ctm_delete_shop:
--   Queries storage.objects BEFORE deletion and returns the paths grouped
--   by bucket. The calling JS client then calls supabase.storage.from(bucket)
--   .remove(paths) for each bucket — admin session is still valid at that point.
--
-- ctm_delete_user_account:
--   Deletes storage.objects rows DIRECTLY inside the function using
--   set_config('storage.allow_delete_query','true',true) to satisfy the
--   protect_delete trigger. The user's session is dead after DELETE FROM
--   auth.users, so the client cannot make storage API calls after the RPC.
--
-- Buckets scoped to a shop / owner:
--   brand-assets        logos/{owner_id}_logo_*
--   storefronts         covers/{owner_id}_storefront_*
--   products            {owner_id}_{timestamp}_img{n}.*  (flat, no folder)
--   shops-banner-storage {shop_id}/{timestamp}_generated_banner.*
--   cac-documents       cac/{owner_id}_cac_*
--   id-documents        ids/{owner_id}_id-card_*
--   kyc_videos          {owner_id}_*
--   payment-receipts    {owner_id}/{shop_id}/*
--
-- Additional bucket for user account delete:
--   avatars             {user_id}/*

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ctm_delete_shop — returns storage paths; client handles removal
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ctm_delete_shop(p_shop_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
DECLARE
  v_admin_role    text;
  v_shop_name     text;
  v_owner_id      uuid;
  v_storage_paths jsonb;
BEGIN
  -- Authorization: super_admin only
  v_admin_role := (SELECT public.get_admin_role())::text;
  IF v_admin_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized: only super admins can delete shops.';
  END IF;

  -- Fetch shop info before deletion
  SELECT name, owner_id INTO v_shop_name, v_owner_id
  FROM public.shops WHERE id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found: %', p_shop_id;
  END IF;

  -- Collect storage paths (read-only; client will call Storage API to delete)
  SELECT jsonb_build_object(
    'brand_assets',
      COALESCE((
        SELECT array_agg(name) FROM storage.objects
        WHERE bucket_id = 'brand-assets'
          AND name LIKE 'logos/' || v_owner_id::text || '%'
      ), ARRAY[]::text[]),

    'storefronts',
      COALESCE((
        SELECT array_agg(name) FROM storage.objects
        WHERE bucket_id = 'storefronts'
          AND name LIKE 'covers/' || v_owner_id::text || '%'
      ), ARRAY[]::text[]),

    'products',
      COALESCE((
        SELECT array_agg(name) FROM storage.objects
        WHERE bucket_id = 'products'
          AND name LIKE v_owner_id::text || '%'
      ), ARRAY[]::text[]),

    'shop_banners',
      COALESCE((
        SELECT array_agg(name) FROM storage.objects
        WHERE bucket_id = 'shops-banner-storage'
          AND name LIKE p_shop_id::text || '/%'
      ), ARRAY[]::text[]),

    'cac_documents',
      COALESCE((
        SELECT array_agg(name) FROM storage.objects
        WHERE bucket_id = 'cac-documents'
          AND name LIKE 'cac/' || v_owner_id::text || '%'
      ), ARRAY[]::text[]),

    'id_documents',
      COALESCE((
        SELECT array_agg(name) FROM storage.objects
        WHERE bucket_id = 'id-documents'
          AND name LIKE 'ids/' || v_owner_id::text || '%'
      ), ARRAY[]::text[]),

    'kyc_videos',
      COALESCE((
        SELECT array_agg(name) FROM storage.objects
        WHERE bucket_id = 'kyc_videos'
          AND name LIKE v_owner_id::text || '%'
      ), ARRAY[]::text[]),

    'payment_receipts',
      COALESCE((
        SELECT array_agg(name) FROM storage.objects
        WHERE bucket_id = 'payment-receipts'
          AND name LIKE v_owner_id::text || '/' || p_shop_id::text || '/%'
      ), ARRAY[]::text[])
  ) INTO v_storage_paths;

  -- Delete database records in FK-safe order
  DELETE FROM public.whatsapp_clicks      WHERE shop_id = p_shop_id;
  DELETE FROM public.shop_likes           WHERE shop_id = p_shop_id;
  DELETE FROM public.service_fee_payments WHERE shop_id = p_shop_id;
  DELETE FROM public.sponsored_products   WHERE shop_id = p_shop_id;
  DELETE FROM public.products             WHERE shop_id = p_shop_id;
  DELETE FROM public.shops                WHERE id = p_shop_id;

  RETURN jsonb_build_object(
    'success',           true,
    'deleted_shop_id',   p_shop_id,
    'deleted_shop_name', v_shop_name,
    'owner_id',          v_owner_id,
    'storage',           v_storage_paths
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ctm_delete_shop(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_delete_shop(bigint) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ctm_delete_user_account — deletes storage.objects directly inside the fn
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ctm_delete_user_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage', 'auth'
AS $$
DECLARE
  v_uid      uuid;
  v_shop_ids bigint[];
  v_shop_id  bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF (SELECT public.get_admin_role()) IS NOT NULL
     OR (SELECT public.is_staff_member()) THEN
    RAISE EXCEPTION 'Admin and staff accounts cannot be self-deleted. Contact a super admin.';
  END IF;

  -- ── Collect shop IDs before they are deleted ─────────────────────────────
  SELECT array_agg(id) INTO v_shop_ids
  FROM public.shops WHERE owner_id = v_uid;

  -- ── Step 1: owned shops — full cascade chain ──────────────────────────────
  FOR v_shop_id IN SELECT id FROM public.shops WHERE owner_id = v_uid LOOP
    DELETE FROM public.whatsapp_clicks      WHERE shop_id = v_shop_id;
    DELETE FROM public.shop_likes           WHERE shop_id = v_shop_id;
    DELETE FROM public.service_fee_payments WHERE shop_id = v_shop_id;
    DELETE FROM public.sponsored_products   WHERE shop_id = v_shop_id;
    DELETE FROM public.products             WHERE shop_id = v_shop_id;
    DELETE FROM public.shops                WHERE id = v_shop_id;
  END LOOP;

  -- ── Step 2: user activity ─────────────────────────────────────────────────
  DELETE FROM public.whatsapp_clicks WHERE clicker_id = v_uid;
  DELETE FROM public.shop_likes      WHERE user_id = v_uid;
  DELETE FROM public.wishlist        WHERE user_id = v_uid;
  DELETE FROM public.notifications   WHERE user_id = v_uid;
  DELETE FROM public.fcm_tokens      WHERE user_id = v_uid;
  DELETE FROM public.support_tickets WHERE user_id = v_uid;
  DELETE FROM public.abuse_reports   WHERE reporter_id = v_uid;
  UPDATE public.promo_codes SET used_by = NULL WHERE used_by = v_uid;

  -- ── Step 3: storage cleanup ───────────────────────────────────────────────
  -- Allow direct deletion from storage.objects for this transaction only.
  -- The protect_delete trigger checks this setting before raising an exception.
  PERFORM set_config('storage.allow_delete_query', 'true', true);

  -- Files keyed by owner/user UUID
  DELETE FROM storage.objects
  WHERE (bucket_id = 'avatars'          AND name LIKE v_uid::text || '/%')
     OR (bucket_id = 'brand-assets'     AND name LIKE 'logos/' || v_uid::text || '%')
     OR (bucket_id = 'storefronts'      AND name LIKE 'covers/' || v_uid::text || '%')
     OR (bucket_id = 'products'         AND name LIKE v_uid::text || '%')
     OR (bucket_id = 'cac-documents'    AND name LIKE 'cac/' || v_uid::text || '%')
     OR (bucket_id = 'id-documents'     AND name LIKE 'ids/' || v_uid::text || '%')
     OR (bucket_id = 'kyc_videos'       AND name LIKE v_uid::text || '%')
     OR (bucket_id = 'payment-receipts' AND name LIKE v_uid::text || '/%');

  -- Shop banner files are keyed by shop_id — must use the collected array
  IF v_shop_ids IS NOT NULL THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'shops-banner-storage'
      AND EXISTS (
        SELECT 1 FROM unnest(v_shop_ids) AS sid(id)
        WHERE storage.objects.name LIKE sid.id::text || '/%'
      );
  END IF;

  -- ── Step 4: public profile (cascades shop_banners_news) ───────────────────
  DELETE FROM public.profiles WHERE id = v_uid;

  -- ── Step 5: auth user (cascades sessions, identities, MFA, etc.) ──────────
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'deleted_user_id', v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.ctm_delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_delete_user_account() TO authenticated;
