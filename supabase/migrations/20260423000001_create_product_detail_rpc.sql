-- RPC: get_product_detail_payload
-- Consolidates all necessary product detail data into a single request

CREATE OR REPLACE FUNCTION public.get_product_detail_payload(
    p_product_id uuid,
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
    -- Get product category first for recommendations
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

GRANT EXECUTE ON FUNCTION public.get_product_detail_payload(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_detail_payload(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_product_detail_payload(uuid, uuid) TO service_role;
