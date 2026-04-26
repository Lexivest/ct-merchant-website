-- Fix mutable search_path on dashboard payload RPC.

CREATE OR REPLACE FUNCTION public.get_dashboard_payload(
    p_user_id uuid,
    p_city_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_now timestamp with time zone := now();
    v_result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'featured_banners', (
            SELECT coalesce(jsonb_agg(b), '[]'::jsonb)
            FROM (
                SELECT b.*, s.name as shop_name, s.is_verified as shop_verified
                FROM public.featured_city_banners b
                LEFT JOIN public.shops s ON b.shop_id = s.id
                WHERE b.city_id = p_city_id
                  AND b.status = 'published'
                  AND (b.starts_at IS NULL OR b.starts_at <= v_now)
                  AND (b.ends_at IS NULL OR b.ends_at >= v_now)
                ORDER BY b.sort_order ASC
                LIMIT 10
            ) b
        ),
        'sponsored_products', (
            SELECT coalesce(jsonb_agg(p), '[]'::jsonb)
            FROM (
                SELECT sp.*, p.name as product_name, p.price, p.image_url, s.name as shop_name
                FROM public.sponsored_products sp
                JOIN public.products p ON sp.template_key = p.id::text
                JOIN public.shops s ON p.shop_id = s.id
                WHERE sp.status = 'published'
                  AND sp.layout = 'product'
                  AND (sp.city_id IS NULL OR sp.city_id = p_city_id)
                ORDER BY sp.sort_order ASC
                LIMIT 15
            ) p
        ),
        'staff_discoveries', (
            SELECT coalesce(jsonb_agg(d), '[]'::jsonb)
            FROM (
                SELECT *
                FROM public.staff_discoveries
                WHERE status = 'published'
                ORDER BY sort_order ASC
                LIMIT 12
            ) d
        ),
        'shops', (
            SELECT coalesce(jsonb_agg(s), '[]'::jsonb)
            FROM (
                SELECT *
                FROM public.shops
                WHERE city_id = p_city_id
                ORDER BY is_featured DESC, is_verified DESC
                LIMIT 100
            ) s
        ),
        'notifications', (
            SELECT coalesce(jsonb_agg(n), '[]'::jsonb)
            FROM (
                SELECT *
                FROM public.notifications
                WHERE user_id = p_user_id
                ORDER BY created_at DESC
                LIMIT 15
            ) n
        ),
        'wishlist_count', (
            SELECT count(*)::int
            FROM public.wishlist
            WHERE user_id = p_user_id
        ),
        'fairly_used_products', (
            SELECT coalesce(jsonb_agg(p), '[]'::jsonb)
            FROM (
                SELECT p.*, s.name as shop_name
                FROM public.products p
                JOIN public.shops s ON p.shop_id = s.id
                WHERE p.condition = 'Fairly Used'
                  AND p.is_available = true
                ORDER BY p.created_at DESC
                LIMIT 24
            ) p
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_payload(uuid, bigint) TO authenticated;
