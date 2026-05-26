-- Self-service account deletion RPC.
-- Callable only by an authenticated user to delete their OWN account.
-- Admin and staff accounts are blocked — they must be removed by a super admin.
--
-- Deletion order (all NO-ACTION FKs handled explicitly):
--
--  For each shop owned by this user:
--    whatsapp_clicks (shop_id)  → shop_likes (shop_id) → service_fee_payments (shop_id)
--    → sponsored_products (shop_id) → products (shop_id) → shops (id)
--
--  Then user activity:
--    whatsapp_clicks (clicker_id) → shop_likes (user_id) → wishlist (user_id)
--    → notifications (user_id) → fcm_tokens (user_id) → support_tickets (user_id)
--    → abuse_reports (reporter_id) → promo_codes.used_by SET NULL
--
--  Then:
--    profiles  (id)       — cascades shop_banners_news.merchant_id
--    auth.users (id)      — cascades sessions, identities, MFA, webauthn, etc.
--
--  Preserved (SET NULL or unaffected):
--    physical_verification_payments.merchant_id  → CASCADE (deleted with auth.users)
--    offline_payment_proofs.merchant_id          → CASCADE (deleted with auth.users)
--    shop_analytics_events.actor_user_id         → SET NULL
--    agent_applications.user_id                  → SET NULL
--    login_security_guards.user_id               → SET NULL
--    shop_comments.user_id                       → CASCADE (deleted with auth.users)

CREATE OR REPLACE FUNCTION public.ctm_delete_user_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_uid     uuid;
  v_shop_id bigint;
BEGIN
  -- Authentication check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  -- Block admin and staff self-deletion — must go through super admin
  IF (SELECT public.get_admin_role()) IS NOT NULL
     OR (SELECT public.is_staff_member()) THEN
    RAISE EXCEPTION 'Admin and staff accounts cannot be self-deleted. Contact a super admin.';
  END IF;

  -- ── Step 1: owned shops — full cascade chain for each ────────────────────
  FOR v_shop_id IN SELECT id FROM public.shops WHERE owner_id = v_uid LOOP
    DELETE FROM public.whatsapp_clicks      WHERE shop_id = v_shop_id;
    DELETE FROM public.shop_likes           WHERE shop_id = v_shop_id;
    DELETE FROM public.service_fee_payments WHERE shop_id = v_shop_id;
    DELETE FROM public.sponsored_products   WHERE shop_id = v_shop_id;
    DELETE FROM public.products             WHERE shop_id = v_shop_id;
    DELETE FROM public.shops                WHERE id = v_shop_id;
  END LOOP;

  -- ── Step 2: user activity across the platform ─────────────────────────────
  -- Clicks made on other shops/products as a visitor
  DELETE FROM public.whatsapp_clicks WHERE clicker_id = v_uid;
  -- Likes on shops the user didn't own
  DELETE FROM public.shop_likes      WHERE user_id = v_uid;
  -- Saved wishlist items
  DELETE FROM public.wishlist        WHERE user_id = v_uid;
  -- In-app notifications (references profiles — must precede profiles delete)
  DELETE FROM public.notifications   WHERE user_id = v_uid;
  -- Push notification tokens
  DELETE FROM public.fcm_tokens      WHERE user_id = v_uid;
  -- Support tickets
  DELETE FROM public.support_tickets WHERE user_id = v_uid;
  -- Abuse reports filed by this user (references profiles — must precede profiles delete)
  DELETE FROM public.abuse_reports   WHERE reporter_id = v_uid;
  -- Promo code usage — null the reference, preserve the code record
  UPDATE public.promo_codes SET used_by = NULL WHERE used_by = v_uid;

  -- ── Step 3: public profile ────────────────────────────────────────────────
  -- Must precede auth.users delete (FK is NO ACTION).
  -- Cascades: shop_banners_news.merchant_id (CASCADE)
  DELETE FROM public.profiles WHERE id = v_uid;

  -- ── Step 4: auth user — cascades all auth-internal tables ─────────────────
  -- Cascades: sessions, identities, mfa_factors, webauthn_credentials,
  --           webauthn_challenges, oauth_authorizations, oauth_consents,
  --           one_time_tokens, offline_payment_proofs.merchant_id,
  --           physical_verification_payments.merchant_id, shop_comments.user_id
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'deleted_user_id', v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.ctm_delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_delete_user_account() TO authenticated;
