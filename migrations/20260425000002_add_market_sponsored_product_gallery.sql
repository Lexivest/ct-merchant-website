-- Extend the dashboard market RPC so sponsored products include
-- their secondary gallery images for the rotating marketplace card.

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
BEGIN
  RETURN jsonb_build_object(
    'featured_banners', (
      SELECT coalesce(jsonb_agg(banner_row), '[]'::jsonb)
      FROM (
        SELECT
          b.*,
          s.name AS shop_name,
          s.is_verified AS shop_verified
        FROM public.featured_city_banners b
        LEFT JOIN public.shops s ON s.id = b.shop_id
        WHERE b.city_id = p_city_id
          AND b.status = 'published'
          AND (b.starts_at IS NULL OR b.starts_at <= v_now)
          AND (b.ends_at IS NULL OR b.ends_at >= v_now)
          AND (
            b.shop_id IS NULL OR (
              s.status = 'approved'
              AND s.is_verified = true
              AND s.is_open = true
              AND s.subscription_end_date > v_now
            )
          )
        ORDER BY b.sort_order ASC, b.created_at DESC
        LIMIT 10
      ) AS banner_row
    ),
    'sponsored_products', (
      SELECT coalesce(jsonb_agg(sponsored_row), '[]'::jsonb)
      FROM (
        SELECT
          sp.*,
          p.name AS product_name,
          p.price,
          p.image_url,
          p.image_url_2,
          p.image_url_3,
          s.name AS shop_name
        FROM public.sponsored_products sp
        JOIN public.products p ON p.id::text = sp.template_key
        JOIN public.shops s ON s.id = p.shop_id
        WHERE sp.status = 'published'
          AND sp.layout = 'product'
          AND sp.city_id = p_city_id
          AND p.is_approved = true
          AND p.is_available = true
          AND s.status = 'approved'
          AND s.is_verified = true
          AND s.is_open = true
          AND s.subscription_end_date > v_now
        ORDER BY sp.sort_order ASC, sp.created_at DESC
        LIMIT 15
      ) AS sponsored_row
    ),
    'staff_discoveries', (
      SELECT coalesce(jsonb_agg(discovery_row), '[]'::jsonb)
      FROM (
        SELECT *
        FROM public.staff_discoveries
        WHERE status = 'published'
        ORDER BY sort_order ASC, created_at DESC
        LIMIT 12
      ) AS discovery_row
    ),
    'shops', (
      SELECT coalesce(jsonb_agg(shop_row), '[]'::jsonb)
      FROM (
        SELECT *
        FROM public.shops
        WHERE city_id = p_city_id
          AND status = 'approved'
          AND is_verified = true
          AND is_open = true
          AND subscription_end_date > v_now
        ORDER BY is_featured DESC, is_verified DESC, created_at DESC
        LIMIT 100
      ) AS shop_row
    ),
    'products', (
      SELECT coalesce(jsonb_agg(product_row), '[]'::jsonb)
      FROM (
        SELECT p.*
        FROM public.products p
        JOIN public.shops s ON s.id = p.shop_id
        WHERE s.city_id = p_city_id
          AND p.is_approved = true
          AND p.is_available = true
          AND s.status = 'approved'
          AND s.is_verified = true
          AND s.is_open = true
          AND s.subscription_end_date > v_now
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 400
      ) AS product_row
    ),
    'notifications', (
      SELECT coalesce(jsonb_agg(notification_row), '[]'::jsonb)
      FROM (
        SELECT *
        FROM public.notifications
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
        LIMIT 15
      ) AS notification_row
    ),
    'wishlist_count', (
      SELECT count(*)::int
      FROM public.wishlist
      WHERE user_id = p_user_id
    ),
    'fairly_used_products', (
      SELECT coalesce(jsonb_agg(fairly_used_row), '[]'::jsonb)
      FROM (
        SELECT
          p.*,
          s.name AS shop_name
        FROM public.products p
        JOIN public.shops s ON s.id = p.shop_id
        WHERE p.condition = 'Fairly Used'
          AND p.is_available = true
          AND p.is_approved = true
          AND s.status = 'approved'
          AND s.is_verified = true
          AND s.is_open = true
          AND s.subscription_end_date > v_now
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 24
      ) AS fairly_used_row
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_payload(uuid, bigint) TO authenticated;
