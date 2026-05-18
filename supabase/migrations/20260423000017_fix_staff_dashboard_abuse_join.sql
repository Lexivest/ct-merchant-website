-- Follow-up migration for staff dashboard payload.
-- Supabase will not rerun an already applied migration version if its contents change,
-- so this new version redefines the RPC with the correct abuse_reports join.

DROP FUNCTION IF EXISTS public.get_staff_dashboard_payload(boolean, bigint);

CREATE OR REPLACE FUNCTION public.get_staff_dashboard_payload(
    p_is_super_admin boolean,
    p_city_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_result jsonb;
    v_now_lagos date := (now() AT TIME ZONE 'Africa/Lagos')::date;
BEGIN
    SELECT jsonb_build_object(
        'summary', jsonb_build_object(
            'shop_count', (
                SELECT count(*)::int
                FROM shops
                WHERE (p_is_super_admin OR p_city_id IS NULL OR city_id = p_city_id)
            ),
            'inactive_users_count', (
                SELECT count(*)::int
                FROM auth.users u
                LEFT JOIN public.profiles p ON p.id = u.id
                LEFT JOIN public.staff_profiles sp ON sp.id = u.id
                WHERE sp.id IS NULL
                  AND u.email IS NOT NULL
                  AND (p_city_id IS NULL OR p.city_id = p_city_id)
                  AND coalesce(u.last_sign_in_at, u.created_at) <= now() - interval '180 days'
            ),
            'visits_today', (
                SELECT coalesce(sum(total_visits), 0)::int
                FROM daily_site_visits
                WHERE visit_date = v_now_lagos
            )
        ),
        'counts', jsonb_build_object(
            'verifications', (
                SELECT (
                    (SELECT count(*)::int FROM shops WHERE status = 'pending' AND (p_is_super_admin OR p_city_id IS NULL OR city_id = p_city_id)) +
                    (SELECT count(*)::int FROM shops WHERE kyc_status = 'submitted' AND (p_is_super_admin OR p_city_id IS NULL OR city_id = p_city_id))
                )
            ),
            'products', (
                SELECT count(*)::int
                FROM products p
                JOIN shops s ON p.shop_id = s.id
                WHERE p.is_approved = false
                  AND p.rejection_reason IS NULL
                  AND (p_is_super_admin OR p_city_id IS NULL OR s.city_id = p_city_id)
            ),
            'payments', (
                CASE WHEN p_is_super_admin THEN
                    (SELECT count(*)::int FROM offline_payment_proofs WHERE status = 'pending')
                ELSE 0 END
            ),
            'community', (
                SELECT count(*)::int
                FROM shop_comments c
                JOIN shops s ON c.shop_id = s.id
                WHERE c.status = 'pending'
                  AND (p_is_super_admin OR p_city_id IS NULL OR s.city_id = p_city_id)
            ),
            'content', (
                SELECT count(*)::int
                FROM shop_banners_news bn
                JOIN shops s ON bn.shop_id = s.id
                WHERE bn.status = 'pending'
                  AND (p_is_super_admin OR p_city_id IS NULL OR s.city_id = p_city_id)
            ),
            'inbox', (
                (SELECT count(*)::int FROM contact_messages WHERE status = 'unread' OR status IS NULL) +
                (SELECT count(*)::int
                 FROM abuse_reports r
                 JOIN profiles p ON r.reporter_id = p.id
                 WHERE (r.status = 'pending' OR r.status IS NULL)
                   AND (p_is_super_admin OR p_city_id IS NULL OR p.city_id = p_city_id)
                )
            ),
            'radar', (
                CASE WHEN p_is_super_admin THEN
                    (SELECT count(*)::int FROM ctm_get_security_radar_insights())
                ELSE 0 END
            )
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_payload(boolean, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_payload(boolean, bigint) TO service_role;
