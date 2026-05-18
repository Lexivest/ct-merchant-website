-- Pass 2 security hardening:
-- Move internal SECURITY DEFINER helper logic into a non-exposed schema and
-- leave public-schema shims as SECURITY INVOKER wrappers. This keeps existing
-- RLS policies and RPC call sites stable while removing the direct public RPC
-- exposure of privileged helper implementations.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- =========================================================
-- Private helper implementations
-- =========================================================

CREATE OR REPLACE FUNCTION private.get_admin_role()
RETURNS public.admin_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role
  FROM public.admins
  WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.get_admin_city()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT city_id
  FROM public.admins
  WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.is_staff_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_profiles sp
    WHERE sp.id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.is_staff_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'private'
AS $$
  SELECT private.is_staff_member();
$$;

CREATE OR REPLACE FUNCTION private.ctm_staff_role()
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

CREATE OR REPLACE FUNCTION private.ctm_staff_city_id()
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

CREATE OR REPLACE FUNCTION private.ctm_has_staff_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'private'
AS $$
  SELECT
    (SELECT private.get_admin_role()) IS NOT NULL
    OR (SELECT private.is_staff_member());
$$;

CREATE OR REPLACE FUNCTION private.ctm_has_super_staff_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'private', 'public'
AS $$
  SELECT
    (SELECT private.get_admin_role()) = 'super_admin'::public.admin_role
    OR (SELECT private.ctm_staff_role()) = 'super_admin';
$$;

CREATE OR REPLACE FUNCTION private.ctm_current_staff_city_scope()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'private'
AS $$
  SELECT COALESCE(
    (SELECT private.get_admin_city()),
    (SELECT private.ctm_staff_city_id())
  );
$$;

CREATE OR REPLACE FUNCTION private.ctm_has_admin_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'private'
AS $$
  SELECT (SELECT private.get_admin_role()) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION private.ctm_is_login_guard_suspended(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'private'
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF auth.uid() IS NOT NULL
    AND auth.uid() <> p_user_id
    AND NOT private.is_staff_member()
    AND private.get_admin_role() IS NULL
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.login_security_guards lsg
    WHERE lsg.user_id = p_user_id
      AND lsg.suspended_at IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.ctm_shop_comment_parent_is_valid(
  p_parent_id uuid,
  p_shop_id bigint
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shop_comments parent
    WHERE parent.id = p_parent_id
      AND parent.shop_id = p_shop_id
  );
$$;

CREATE OR REPLACE FUNCTION private.ctm_storage_object_owned_by_current_user(
  p_bucket_id text,
  p_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_uid_text text := v_uid::text;
  v_first_segment text := split_part(coalesce(p_name, ''), '/', 1);
BEGIN
  IF v_uid IS NULL OR v_uid_text = '' OR p_name IS NULL OR p_name = '' THEN
    RETURN false;
  END IF;

  IF p_name LIKE v_uid_text || '/%' THEN
    RETURN true;
  END IF;

  IF p_name LIKE v_uid_text || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'ids/' || v_uid_text || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'cac/' || v_uid_text || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'covers/' || v_uid_text || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_name LIKE 'logos/' || v_uid_text || '\_%' ESCAPE '\' THEN
    RETURN true;
  END IF;

  IF p_bucket_id = 'shops-banner-storage' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id::text = v_first_segment
        AND s.owner_id = v_uid
    );
  END IF;

  IF p_bucket_id = 'storefronts' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.owner_id = v_uid
        AND public.ctm_storage_path_from_url(s.storefront_url, p_bucket_id) = p_name
    );
  END IF;

  IF p_bucket_id = 'brand-assets' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.owner_id = v_uid
        AND public.ctm_storage_path_from_url(s.image_url, p_bucket_id) = p_name
    );
  END IF;

  IF p_bucket_id = 'id-documents' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.owner_id = v_uid
        AND public.ctm_storage_path_from_url(s.id_card_url, p_bucket_id) = p_name
    );
  END IF;

  IF p_bucket_id = 'cac-documents' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.owner_id = v_uid
        AND public.ctm_storage_path_from_url(s.cac_certificate_url, p_bucket_id) = p_name
    );
  END IF;

  IF p_bucket_id IN ('kyc-videos', 'kyc_videos') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.owner_id = v_uid
        AND public.ctm_storage_path_from_url(s.kyc_video_url, p_bucket_id) = p_name
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.get_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_admin_city() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_staff_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_staff_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_staff_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_staff_city_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_has_staff_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_has_super_staff_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_current_staff_city_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_has_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_is_login_guard_suspended(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_shop_comment_parent_is_valid(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ctm_storage_object_owned_by_current_user(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.get_admin_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_admin_city() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff_member() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff_user() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_staff_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_staff_city_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_has_staff_access() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_has_super_staff_access() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_current_staff_city_scope() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_has_admin_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_is_login_guard_suspended(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_shop_comment_parent_is_valid(uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_storage_object_owned_by_current_user(text, text) TO authenticated, service_role;

-- =========================================================
-- Public SECURITY INVOKER wrappers
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_admin_role()
RETURNS public.admin_role
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.get_admin_role();
$$;

CREATE OR REPLACE FUNCTION public.get_admin_city()
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.get_admin_city();
$$;

CREATE OR REPLACE FUNCTION public.is_staff_member()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.is_staff_member();
$$;

CREATE OR REPLACE FUNCTION public.is_staff_user()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.is_staff_user();
$$;

CREATE OR REPLACE FUNCTION public.ctm_staff_role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.ctm_staff_role();
$$;

CREATE OR REPLACE FUNCTION public.ctm_staff_city_id()
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.ctm_staff_city_id();
$$;

CREATE OR REPLACE FUNCTION public.ctm_has_staff_access()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.ctm_has_staff_access();
$$;

CREATE OR REPLACE FUNCTION public.ctm_has_super_staff_access()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.ctm_has_super_staff_access();
$$;

CREATE OR REPLACE FUNCTION public.ctm_current_staff_city_scope()
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.ctm_current_staff_city_scope();
$$;

CREATE OR REPLACE FUNCTION public.ctm_has_admin_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.ctm_has_admin_role();
$$;

CREATE OR REPLACE FUNCTION public.ctm_is_login_guard_suspended(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.ctm_is_login_guard_suspended(p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.ctm_shop_comment_parent_is_valid(
  p_parent_id uuid,
  p_shop_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.ctm_shop_comment_parent_is_valid(p_parent_id, p_shop_id);
$$;

CREATE OR REPLACE FUNCTION public.ctm_storage_object_owned_by_current_user(
  p_bucket_id text,
  p_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.ctm_storage_object_owned_by_current_user(p_bucket_id, p_name);
$$;

REVOKE ALL ON FUNCTION public.get_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_city() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_staff_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_staff_city_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_has_staff_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_has_super_staff_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_current_staff_city_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_has_admin_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_is_login_guard_suspended(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_shop_comment_parent_is_valid(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_storage_object_owned_by_current_user(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_city() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff_member() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff_user() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_staff_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_staff_city_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_has_staff_access() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_has_super_staff_access() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_current_staff_city_scope() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_has_admin_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_is_login_guard_suspended(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_shop_comment_parent_is_valid(uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_storage_object_owned_by_current_user(text, text) TO authenticated, service_role;
