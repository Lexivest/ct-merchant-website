-- Harden product detail recommendations for marketplace and public repo flows.
-- Recommendations should only include approved, available products from active
-- approved shops, and each item must carry its own shop_id for safe navigation.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.get_product_detail_payload(
  p_product_id bigint,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_wishlist_user_id uuid := NULL;
  v_category text;
  v_shop_id bigint;
  v_shop_city_id bigint;
  v_is_owner boolean := false;
  v_is_staff boolean := false;
  v_is_visible boolean := false;
  v_now timestamp with time zone := now();
BEGIN
  SELECT p.category, p.shop_id, s.city_id
  INTO v_category, v_shop_id, v_shop_city_id
  FROM public.products p
  JOIN public.shops s
    ON s.id = p.shop_id
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'product', NULL,
      'recommendations', '[]'::jsonb,
      'initial_wishlist', false
    );
  END IF;

  v_wishlist_user_id := CASE
    WHEN p_user_id IS NOT NULL AND p_user_id = v_actor_id THEN p_user_id
    ELSE NULL
  END;

  v_is_owner := v_actor_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = v_shop_id
      AND s.owner_id = v_actor_id
  );

  v_is_staff := v_actor_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.staff_profiles sp
    WHERE sp.id = v_actor_id
  );

  v_is_visible := v_is_owner OR v_is_staff OR EXISTS (
    SELECT 1
    FROM public.products p
    JOIN public.shops s
      ON s.id = p.shop_id
    JOIN public.cities c
      ON c.id = s.city_id
    WHERE p.id = p_product_id
      AND p.is_available = true
      AND p.is_approved = true
      AND s.status = 'approved'::public.application_status
      AND s.is_verified = true
      AND s.is_open = true
      AND s.subscription_end_date > v_now
      AND c.is_open = true
  );

  IF NOT v_is_visible THEN
    RETURN jsonb_build_object(
      'product', NULL,
      'recommendations', '[]'::jsonb,
      'initial_wishlist', false
    );
  END IF;

  RETURN jsonb_build_object(
    'product', (
      SELECT row_to_json(product_payload.*)
      FROM (
        SELECT
          p.*,
          jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'whatsapp', s.whatsapp,
            'phone', s.phone,
            'address', s.address,
            'city_id', s.city_id,
            'areas', jsonb_build_object('name', a.name),
            'cities', jsonb_build_object('name', c.name)
          ) AS shops
        FROM public.products p
        JOIN public.shops s
          ON p.shop_id = s.id
        LEFT JOIN public.areas a
          ON s.area_id = a.id
        LEFT JOIN public.cities c
          ON s.city_id = c.id
        WHERE p.id = p_product_id
      ) product_payload
    ),
    'recommendations', (
      SELECT coalesce(jsonb_agg(rec_payload), '[]'::jsonb)
      FROM (
        SELECT
          p.id,
          p.shop_id,
          p.name,
          p.price,
          p.discount_price,
          p.image_url
        FROM public.products p
        JOIN public.shops s
          ON p.shop_id = s.id
        JOIN public.cities c
          ON c.id = s.city_id
        WHERE v_category IS NOT NULL
          AND p.category = v_category
          AND p.id <> p_product_id
          AND p.is_available = true
          AND p.is_approved = true
          AND s.status = 'approved'::public.application_status
          AND s.is_verified = true
          AND s.is_open = true
          AND s.subscription_end_date > v_now
          AND c.is_open = true
        ORDER BY
          (s.city_id = v_shop_city_id) DESC,
          p.created_at DESC NULLS LAST,
          p.id DESC
        LIMIT 10
      ) rec_payload
    ),
    'initial_wishlist', (
      v_wishlist_user_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.wishlist w
        WHERE w.user_id = v_wishlist_user_id
          AND w.product_id = p_product_id
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.get_product_detail_payload(bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_product_detail_payload(bigint, uuid)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_product_detail_payload(
  p_product_id bigint,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
  SELECT private.get_product_detail_payload(p_product_id, p_user_id);
$$;

REVOKE ALL ON FUNCTION public.get_product_detail_payload(bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_detail_payload(bigint, uuid)
  TO anon, authenticated, service_role;
