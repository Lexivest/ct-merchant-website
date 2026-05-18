-- RPC: get_shop_detail_payload
-- Consolidates all necessary shop detail data into a single request

CREATE OR REPLACE FUNCTION public.get_shop_detail_payload(
    p_shop_id uuid,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_result jsonb;
BEGIN
    -- 1. Verify shop exists and get base info
    SELECT jsonb_build_object(
        'shop', (
            SELECT row_to_json(s.*)
            FROM (
                SELECT s.*, c.name as city_name
                FROM shops s
                LEFT JOIN cities c ON s.city_id = c.id
                WHERE s.id = p_shop_id
            ) s
        ),
        'products', (
            SELECT coalesce(jsonb_agg(p), '[]'::jsonb)
            FROM (
                SELECT *
                FROM products
                WHERE shop_id = p_shop_id
                  AND is_available = true
                ORDER BY id ASC
                LIMIT 100
            ) p
        ),
        'like_count', (
            SELECT count(*)::int
            FROM shop_likes
            WHERE shop_id = p_shop_id
        ),
        'has_liked', (
            CASE 
                WHEN p_user_id IS NOT NULL THEN
                    EXISTS (SELECT 1 FROM shop_likes WHERE shop_id = p_shop_id AND user_id = p_user_id)
                ELSE false
            END
        ),
        'shop_banner', (
            SELECT content_data
            FROM shop_banners_news
            WHERE shop_id = p_shop_id
              AND status = 'approved'
              AND content_type = 'banner'
            ORDER BY created_at DESC
            LIMIT 1
        ),
        'approved_news', (
            SELECT coalesce(jsonb_agg(content_data), '[]'::jsonb)
            FROM shop_banners_news
            WHERE shop_id = p_shop_id
              AND status = 'approved'
              AND content_type = 'news'
            ORDER BY created_at DESC
        ),
        'owner_profile', (
            SELECT jsonb_build_object(
                'id', p.id,
                'full_name', p.full_name,
                'avatar_url', p.avatar_url
            )
            FROM profiles p
            JOIN shops s ON s.owner_id = p.id
            WHERE s.id = p_shop_id
            LIMIT 1
        )
    ) INTO v_result;

    -- 2. Optional: Record shop view if user is not the owner
    IF p_user_id IS NOT NULL THEN
        INSERT INTO shop_views (shop_id, viewer_id)
        SELECT p_shop_id, p_user_id
        WHERE NOT EXISTS (
            SELECT 1 FROM shops WHERE id = p_shop_id AND owner_id = p_user_id
        )
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_detail_payload(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shop_detail_payload(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_shop_detail_payload(uuid, uuid) TO service_role;
