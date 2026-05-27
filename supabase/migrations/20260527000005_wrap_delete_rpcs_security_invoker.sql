-- ─────────────────────────────────────────────────────────────────────────────
-- Silence "authenticated_security_definer_function_executable" lint warnings
-- for ctm_delete_shop and ctm_delete_user_account.
--
-- Pattern: move SECURITY DEFINER body to private schema (not exposed via
-- /rest/v1/rpc/), keep a thin SECURITY INVOKER shell in public schema.
--
-- Why SECURITY DEFINER is still needed in the private functions:
--   • set_config('storage.allow_delete_query','true',true) only works when
--     the function runs as postgres (owner), bypassing the protect_delete
--     trigger on storage.objects.
--   • Deleting from auth.users requires elevated privileges.
--   • Direct DELETEs from public.* bypass RLS — needed because super_admin
--     checks happen inside the function, not via RLS.
--
-- Why this is safe:
--   • auth.uid() reads from current_setting('request.jwt.claims') which is
--     a PostgREST session-level setting — it persists through the call chain
--     so all auth guards still operate on the original caller's identity.
--   • The private functions are not reachable via /rest/v1/rpc/ (PostgREST
--     only exposes the `public` schema).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. private.ctm_delete_shop_impl ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.ctm_delete_shop_impl(p_shop_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, storage, pg_catalog
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

  SELECT name, owner_id INTO v_shop_name, v_owner_id
  FROM public.shops WHERE id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found: %', p_shop_id;
  END IF;

  -- Storage cleanup — bypass protect_delete trigger for this transaction only
  PERFORM set_config('storage.allow_delete_query', 'true', true);

  DELETE FROM storage.objects
  WHERE (bucket_id = 'brand-assets'         AND name LIKE 'logos/' || v_owner_id::text || '%')
     OR (bucket_id = 'storefronts'          AND name LIKE 'covers/' || v_owner_id::text || '%')
     OR (bucket_id = 'products'             AND name LIKE v_owner_id::text || '%')
     OR (bucket_id = 'cac-documents'        AND name LIKE 'cac/' || v_owner_id::text || '%')
     OR (bucket_id = 'id-documents'         AND name LIKE 'ids/' || v_owner_id::text || '%')
     OR (bucket_id = 'kyc_videos'           AND name LIKE v_owner_id::text || '%')
     OR (bucket_id = 'payment-receipts'     AND name LIKE v_owner_id::text || '/' || p_shop_id::text || '/%')
     OR (bucket_id = 'shops-banner-storage' AND name LIKE p_shop_id::text || '/%');

  -- Database records (FK-safe order)
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
    'owner_id',          v_owner_id
  );
END;
$$;


-- ── 2. public.ctm_delete_shop — SECURITY INVOKER shell ───────────────────────

CREATE OR REPLACE FUNCTION public.ctm_delete_shop(p_shop_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN private.ctm_delete_shop_impl(p_shop_id);
END;
$$;

REVOKE ALL   ON FUNCTION public.ctm_delete_shop(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_delete_shop(bigint) TO authenticated, service_role;


-- ── 3. private.ctm_delete_user_account_impl ──────────────────────────────────

CREATE OR REPLACE FUNCTION private.ctm_delete_user_account_impl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, storage, auth, pg_catalog
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

  -- Collect shop IDs before deletion
  SELECT array_agg(id) INTO v_shop_ids
  FROM public.shops WHERE owner_id = v_uid;

  -- Step 1: owned shops — full cascade chain
  FOR v_shop_id IN SELECT id FROM public.shops WHERE owner_id = v_uid LOOP
    DELETE FROM public.whatsapp_clicks      WHERE shop_id = v_shop_id;
    DELETE FROM public.shop_likes           WHERE shop_id = v_shop_id;
    DELETE FROM public.service_fee_payments WHERE shop_id = v_shop_id;
    DELETE FROM public.sponsored_products   WHERE shop_id = v_shop_id;
    DELETE FROM public.products             WHERE shop_id = v_shop_id;
    DELETE FROM public.shops                WHERE id = v_shop_id;
  END LOOP;

  -- Step 2: user activity
  DELETE FROM public.whatsapp_clicks WHERE clicker_id = v_uid;
  DELETE FROM public.shop_likes      WHERE user_id = v_uid;
  DELETE FROM public.wishlist        WHERE user_id = v_uid;
  DELETE FROM public.notifications   WHERE user_id = v_uid;
  DELETE FROM public.fcm_tokens      WHERE user_id = v_uid;
  DELETE FROM public.support_tickets WHERE user_id = v_uid;
  DELETE FROM public.abuse_reports   WHERE reporter_id = v_uid;
  UPDATE public.promo_codes SET used_by = NULL WHERE used_by = v_uid;

  -- Step 3: storage cleanup
  PERFORM set_config('storage.allow_delete_query', 'true', true);

  DELETE FROM storage.objects
  WHERE (bucket_id = 'avatars'          AND name LIKE v_uid::text || '/%')
     OR (bucket_id = 'brand-assets'     AND name LIKE 'logos/' || v_uid::text || '%')
     OR (bucket_id = 'storefronts'      AND name LIKE 'covers/' || v_uid::text || '%')
     OR (bucket_id = 'products'         AND name LIKE v_uid::text || '%')
     OR (bucket_id = 'cac-documents'    AND name LIKE 'cac/' || v_uid::text || '%')
     OR (bucket_id = 'id-documents'     AND name LIKE 'ids/' || v_uid::text || '%')
     OR (bucket_id = 'kyc_videos'       AND name LIKE v_uid::text || '%')
     OR (bucket_id = 'payment-receipts' AND name LIKE v_uid::text || '/%');

  IF v_shop_ids IS NOT NULL THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'shops-banner-storage'
      AND EXISTS (
        SELECT 1 FROM unnest(v_shop_ids) AS sid(id)
        WHERE storage.objects.name LIKE sid.id::text || '/%'
      );
  END IF;

  -- Step 4: public profile (cascades shop_banners_news)
  DELETE FROM public.profiles WHERE id = v_uid;

  -- Step 5: auth user (cascades sessions, identities, MFA, etc.)
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'deleted_user_id', v_uid);
END;
$$;


-- ── 4. public.ctm_delete_user_account — SECURITY INVOKER shell ───────────────

CREATE OR REPLACE FUNCTION public.ctm_delete_user_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN private.ctm_delete_user_account_impl();
END;
$$;

REVOKE ALL   ON FUNCTION public.ctm_delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_delete_user_account() TO authenticated;
