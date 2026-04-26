DROP FUNCTION IF EXISTS public.get_shop_detail_payload(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_shop_detail_payload(bigint, uuid);

CREATE OR REPLACE FUNCTION public.get_shop_detail_payload(
    p_shop_id bigint,
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

GRANT EXECUTE ON FUNCTION public.get_shop_detail_payload(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shop_detail_payload(bigint, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_shop_detail_payload(bigint, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.get_product_detail_payload(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_product_detail_payload(bigint, uuid);

CREATE OR REPLACE FUNCTION public.get_product_detail_payload(
    p_product_id bigint,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_result jsonb;
    v_category text;
BEGIN
    SELECT category INTO v_category FROM products WHERE id = p_product_id;

    SELECT jsonb_build_object(
        'product', (
            SELECT row_to_json(p.*)
            FROM (
                SELECT p.*,
                    jsonb_build_object(
                        'id', s.id,
                        'name', s.name,
                        'whatsapp', s.whatsapp,
                        'phone', s.phone,
                        'address', s.address,
                        'city_id', s.city_id,
                        'areas', jsonb_build_object('name', a.name),
                        'cities', jsonb_build_object('name', c.name)
                    ) as shops
                FROM products p
                JOIN shops s ON p.shop_id = s.id
                LEFT JOIN areas a ON s.area_id = a.id
                LEFT JOIN cities c ON s.city_id = c.id
                WHERE p.id = p_product_id
            ) p
        ),
        'recommendations', (
            SELECT coalesce(jsonb_agg(r), '[]'::jsonb)
            FROM (
                SELECT id, name, price, discount_price, image_url
                FROM products
                WHERE category = v_category
                  AND id != p_product_id
                  AND is_available = true
                LIMIT 10
            ) r
        ),
        'initial_wishlist', (
            CASE
                WHEN p_user_id IS NOT NULL THEN
                    EXISTS (SELECT 1 FROM wishlist WHERE user_id = p_user_id AND product_id = p_product_id)
                ELSE false
            END
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_detail_payload(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_detail_payload(bigint, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_product_detail_payload(bigint, uuid) TO service_role;
