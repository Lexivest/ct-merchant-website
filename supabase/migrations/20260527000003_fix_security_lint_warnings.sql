-- ─────────────────────────────────────────────────────────────────────────────
-- Fix all Supabase security lint warnings
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Mutable search_path on private.get_dashboard_payload ──────────────────
--
-- A function without SET search_path is vulnerable to search_path injection:
-- a malicious user could create objects in a schema that shadows pg_catalog or
-- public and have them execute inside the function.
-- Fix: lock the search_path to the schemas the function actually uses.

DO $$
DECLARE
  v_args text;
BEGIN
  SELECT pg_get_function_arguments(p.oid)
  INTO   v_args
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'private'
    AND  p.proname = 'get_dashboard_payload'
  LIMIT  1;

  IF v_args IS NOT NULL THEN
    EXECUTE format(
      'ALTER FUNCTION private.get_dashboard_payload(%s) SET search_path = private, public, pg_catalog, auth',
      v_args
    );
  END IF;
END $$;


-- ── 2. Public bucket SELECT policy allows directory listing ───────────────────
--
-- A broad SELECT policy on storage.objects lets any caller list every file in
-- the bucket via the Storage API.  Public buckets already serve files via their
-- /storage/v1/object/public/… URL without needing any RLS SELECT policy, so
-- this policy is redundant and only widens the attack surface.

DROP POLICY IF EXISTS sponsored_display_images_public_read ON storage.objects;


-- ── 3. Trigger-guard functions callable via the REST API ─────────────────────
--
-- protect_*_admin_columns() functions are TRIGGER functions — they must be
-- SECURITY DEFINER so the trigger engine can invoke them, but they are never
-- meant to be called directly via /rest/v1/rpc/*.
-- Revoking EXECUTE from PUBLIC removes them from the exposed API entirely
-- (the trigger mechanism is unaffected by EXECUTE grants on the role).

REVOKE EXECUTE ON FUNCTION public.protect_flash_sale_admin_columns()          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_notification_admin_columns()         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_sponsored_product_admin_columns()    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_ticker_message_admin_columns()       FROM PUBLIC;


-- ── 4. SECURITY DEFINER utility functions: revoke anon access ────────────────
--
-- ctm_delete_shop and ctm_delete_user_account are SECURITY DEFINER so they can
-- perform privileged operations (e.g. deleting auth.users rows).  Both functions
-- check auth.uid() internally, but anon callers have no uid(), so their calling
-- these functions would always fail silently — and exposing them to unauthenticated
-- requests is unnecessary.
--
-- We keep EXECUTE for the `authenticated` role (signed-in users need
-- ctm_delete_user_account to delete their own account), but strip it from `anon`.

REVOKE EXECUTE ON FUNCTION public.ctm_delete_shop(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ctm_delete_user_account()   FROM anon;


-- ── 5. Leaked password protection ────────────────────────────────────────────
--
-- This cannot be fixed via SQL — it is an Auth configuration setting.
-- Enable it in the Supabase dashboard:
--   Authentication → Security → "Enable leaked password protection"
-- (Uses HaveIBeenPwned.org to block known-compromised passwords at sign-up /
--  password-change time.)
