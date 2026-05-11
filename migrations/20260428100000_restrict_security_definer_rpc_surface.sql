-- Tighten SECURITY DEFINER RPC exposure without breaking known app flows.
-- Pass 1 strategy:
-- 1. Pure internal trigger/helper/edge-only functions => service_role only.
-- 2. Signed-in-only app RPCs/helpers => authenticated + service_role only.
-- 3. Public-facing RPCs (shop/product detail, analytics logging, site visit, etc.) are left untouched for a later review pass.

-- =========================================================
-- Pure internal / trigger / edge-only functions
-- =========================================================

REVOKE ALL ON FUNCTION public.check_repo_search_rate_limit(text, text, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_repo_search_rate_limit(text, text, integer, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_repo_search_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_repo_search_rate_limits() TO service_role;

REVOKE ALL ON FUNCTION public.get_network_info() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_network_info() TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_shop_subscription() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_shop_subscription() TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user_registration() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user_registration() TO service_role;

REVOKE ALL ON FUNCTION public.handle_profile_network_info() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_profile_network_info() TO service_role;

REVOKE ALL ON FUNCTION public.handle_shop_creation_fingerprint() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_shop_creation_fingerprint() TO service_role;

REVOKE ALL ON FUNCTION public.handle_shop_resubmission() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_shop_resubmission() TO service_role;

REVOKE ALL ON FUNCTION public.notify_shop_status_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_shop_status_change() TO service_role;

REVOKE ALL ON FUNCTION public.process_offline_payment_review(bigint, uuid, text, text, text, numeric, text, timestamp with time zone, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_offline_payment_review(bigint, uuid, text, text, text, numeric, text, timestamp with time zone, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.protect_banner_news_admin_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_banner_news_admin_columns() TO service_role;

REVOKE ALL ON FUNCTION public.protect_product_admin_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_product_admin_columns() TO service_role;

REVOKE ALL ON FUNCTION public.protect_product_admin_columns_updated() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_product_admin_columns_updated() TO service_role;

REVOKE ALL ON FUNCTION public.protect_profile_admin_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_admin_columns() TO service_role;

REVOKE ALL ON FUNCTION public.protect_shop_admin_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_shop_admin_columns() TO service_role;

REVOKE ALL ON FUNCTION public.push_user_notification(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_user_notification(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.redeem_verification_promo_code(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_verification_promo_code(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.redeem_verification_promo_code(uuid, text, bigint, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_verification_promo_code(uuid, text, bigint, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.send_city_notification(bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_city_notification(bigint, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.trigger_fcm_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_fcm_notification() TO service_role;

REVOKE ALL ON FUNCTION public.hypopg_reset() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hypopg_reset() TO service_role;

-- =========================================================
-- Signed-in-only RPCs / helpers
-- Remove anon access, keep authenticated + service_role.
-- =========================================================

REVOKE ALL ON FUNCTION public.ctm_get_contact_security_radar(integer, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ctm_get_contact_security_radar(integer, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ctm_get_security_radar_insights() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ctm_get_security_radar_insights() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ctm_get_shop_analytics_summary(bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ctm_get_shop_analytics_summary(bigint, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ctm_get_staff_shop_analytics(integer, bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ctm_get_staff_shop_analytics(integer, bigint, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ctm_purge_old_shop_analytics_data(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ctm_purge_old_shop_analytics_data(integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ctm_reinstate_login_guard(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ctm_reinstate_login_guard(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ctm_shop_comment_parent_is_valid(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ctm_shop_comment_parent_is_valid(uuid, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ctm_staff_update_user_status(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ctm_staff_update_user_status(uuid, text, boolean, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ctm_storage_object_owned_by_current_user(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ctm_storage_object_owned_by_current_user(text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_dashboard_payload(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_payload(uuid, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_staff_dashboard_payload(boolean, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_payload(boolean, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.manage_product(bigint, bigint, text, text, numeric, numeric, text, text, text, text, text, integer, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_product(bigint, bigint, text, text, numeric, numeric, text, text, text, text, text, integer, jsonb, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.redeem_verification_promo_code_self(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_verification_promo_code_self(text, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.register_or_update_shop(text, text, text, text, text, bigint, bigint, text, text, double precision, double precision, text, text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_or_update_shop(text, text, text, text, text, bigint, bigint, text, text, double precision, double precision, text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_site_visit_daily(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_site_visit_daily(integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_site_visit_top_pages(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_site_visit_top_pages(integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_user_activity_summary(integer, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_user_activity_summary(integer, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.stamp_profile_footprint() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stamp_profile_footprint() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.stamp_profile_footprint(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stamp_profile_footprint(uuid) TO authenticated, service_role;
