-- Fix: move storage.objects deletion inside ctm_delete_shop so it runs
-- server-side via set_config bypass, not via the Storage JS API.
--
-- Root cause: the client-side approach in migration 000005 called
-- supabase.storage.from(bucket).remove(paths) after the RPC. That path
-- goes through the Storage RLS policies, which only allow the file OWNER
-- to delete — not a super admin. Buckets without a "super admin delete"
-- policy (storefronts, products, shops-banner-storage, avatars) silently
-- rejected every remove call.
--
-- Fix: delete storage.objects rows directly inside the function using the
-- same set_config('storage.allow_delete_query','true',true) mechanism
-- already used by ctm_delete_user_account. The function is SECURITY DEFINER
-- so it runs as postgres and is not subject to storage RLS.
--
-- The function no longer returns a 'storage' key — storage is fully handled
-- server-side and the JS client needs no post-RPC cleanup calls.

CREATE OR REPLACE FUNCTION public.ctm_delete_shop(p_shop_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage'
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

  -- Fetch shop info before deletion
  SELECT name, owner_id INTO v_shop_name, v_owner_id
  FROM public.shops WHERE id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found: %', p_shop_id;
  END IF;

  -- ── Storage cleanup ───────────────────────────────────────────────────────
  -- Bypass protect_delete trigger for this transaction only.
  -- SECURITY DEFINER runs as postgres so storage RLS does not apply.
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

  -- ── Database records (FK-safe order) ─────────────────────────────────────
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

REVOKE ALL ON FUNCTION public.ctm_delete_shop(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_delete_shop(bigint) TO authenticated, service_role;
