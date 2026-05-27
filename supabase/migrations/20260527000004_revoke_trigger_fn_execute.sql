-- ─────────────────────────────────────────────────────────────────────────────
-- Explicitly revoke EXECUTE on trigger-guard functions from anon + authenticated
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The previous migration ran REVOKE … FROM PUBLIC, which removes the default
-- PUBLIC grant.  However Supabase also holds *explicit* grants to the `anon`
-- and `authenticated` roles (separate from PUBLIC), so those persisted.
-- This migration revokes from both roles directly.
--
-- These four functions are TRIGGER functions — they must be SECURITY DEFINER
-- so the trigger engine can invoke them, but they are never meant to be
-- callable directly via /rest/v1/rpc/*.  Revoking EXECUTE does not affect
-- the trigger mechanism at all.

REVOKE EXECUTE ON FUNCTION public.protect_flash_sale_admin_columns()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.protect_notification_admin_columns()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.protect_sponsored_product_admin_columns()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.protect_ticker_message_admin_columns()
  FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ctm_delete_shop  and  ctm_delete_user_account — authenticated warnings
-- ─────────────────────────────────────────────────────────────────────────────
--
-- These two functions are legitimately user-facing:
--   • ctm_delete_shop       — shop owners and staff delete shops from the UI
--   • ctm_delete_user_account — authenticated users delete their own account
--
-- Both are SECURITY DEFINER because they need to touch privileged rows
-- (e.g. auth.users), and both guard every code-path with auth.uid() checks,
-- so a caller cannot act on behalf of another user.
--
-- Revoking EXECUTE from `authenticated` would silently break shop deletion and
-- account self-deletion, so we intentionally accept the linter warning for
-- these two functions.  The risk is documented here.
