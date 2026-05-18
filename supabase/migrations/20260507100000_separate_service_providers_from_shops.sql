-- Give service providers a first-class marker while keeping the existing shops
-- table, approval flow, KYC flow, subscription flow, and product/service-listing
-- upload flow intact.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS is_service boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shops.is_service IS
  'True when this row represents a service provider instead of a normal marketplace shop.';

UPDATE public.shops
   SET is_service = true
 WHERE lower(coalesce(category, '')) = ANY (ARRAY[
   'plumbing & borehole services',
   'electrical wiring & fault tracing',
   'ac & refrigerator technicians',
   'pop ceiling design & installation',
   'carpentry & furniture making',
   'solar & inverter installation',
   'cctv & security system setup',
   'phone & tablet repair',
   'laptop & computer repair',
   'fumigation & pest control',
   'laundry & dry cleaning',
   'office, industrial & home cleaning',
   'photography & videography',
   'auto mechanic',
   'tailoring & fashion design',
   'hair styling & wig making',
   'dispatch & delivery riders',
   'shawarma & pizza spots',
   'catering, event planning & decorations',
   'dj & sound system rental',
   'suya & kilishi spots',
   'waste management',
   'tutorial centers (jamb, waec & neco prep)',
   'tutorial centers (jamb, waec, & neco prep)',
   'dental clinics & services',
   'eye care & ophthalmology',
   'pharmacy & chemist services',
   'herbal & traditional medicine',
   'home tutors',
   'bakeries & confectioneries',
   'printing services',
   'grill & barbecue spots',
   'medical laboratories & diagnostics',
   'physiotherapy & massage therapy',
   'car security & tracking',
   'driving schools',
   'school of health',
   'language training centers',
   'car hire',
   'matchmaking & matrimonial services',
   'marriage & relationship counseling',
   'mental health & psychological therapy',
   'career & educational counseling',
   'guardian & child welfare services',
   'spiritual & pastoral counseling'
 ]);

CREATE INDEX IF NOT EXISTS ctm_shops_service_market_scope_idx
  ON public.shops (is_service, city_id, status, is_verified, is_open, subscription_end_date);

DROP FUNCTION IF EXISTS public.register_or_update_shop(
  text, text, text, text, text, bigint, bigint, text, text,
  double precision, double precision, text, text, text, text, text,
  text, text, text, text, text, text, text, text, bigint, text
);

DROP FUNCTION IF EXISTS private.register_or_update_shop(
  text, text, text, text, text, bigint, bigint, text, text,
  double precision, double precision, text, text, text, text, text,
  text, text, text, text, text, text, text, text, bigint, text
);

CREATE OR REPLACE FUNCTION private.register_or_update_shop(
    p_name text,
    p_description text DEFAULT NULL,
    p_address text DEFAULT NULL,
    p_phone text DEFAULT NULL,
    p_whatsapp text DEFAULT NULL,
    p_city_id bigint DEFAULT NULL,
    p_area_id bigint DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_business_type text DEFAULT NULL,
    p_latitude double precision DEFAULT NULL,
    p_longitude double precision DEFAULT NULL,
    p_id_type text DEFAULT NULL,
    p_id_number text DEFAULT NULL,
    p_cac_number text DEFAULT NULL,
    p_image_url text DEFAULT NULL,
    p_storefront_url text DEFAULT NULL,
    p_id_card_url text DEFAULT NULL,
    p_cac_certificate_url text DEFAULT NULL,
    p_kyc_video_url text DEFAULT NULL,
    p_facebook_url text DEFAULT NULL,
    p_instagram_url text DEFAULT NULL,
    p_twitter_url text DEFAULT NULL,
    p_tiktok_url text DEFAULT NULL,
    p_website_url text DEFAULT NULL,
    p_shop_id bigint DEFAULT NULL,
    p_telegram_url text DEFAULT NULL,
    p_is_service boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_shop_id bigint;
    v_existing_shop public.shops%ROWTYPE;
    v_now timestamp with time zone := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO v_existing_shop
      FROM public.shops
     WHERE owner_id = v_user_id
     ORDER BY created_at DESC NULLS LAST, id DESC
     LIMIT 1;

    BEGIN
        IF v_existing_shop.id IS NOT NULL THEN
            IF p_shop_id IS NULL THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'SHOP_ALREADY_EXISTS',
                    'shop_id', v_existing_shop.id,
                    'status', v_existing_shop.status,
                    'is_service', v_existing_shop.is_service,
                    'message', 'A business profile already exists for this account. Open your dashboard or correction form instead.'
                );
            END IF;

            IF v_existing_shop.id <> p_shop_id THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'SHOP_ACCESS_DENIED',
                    'message', 'Business profile not found or access denied.'
                );
            END IF;

            IF v_existing_shop.status <> 'rejected'::application_status THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'SHOP_SUBMISSION_LOCKED',
                    'shop_id', v_existing_shop.id,
                    'status', v_existing_shop.status,
                    'is_service', v_existing_shop.is_service,
                    'message', 'This registration is locked and cannot be resubmitted right now.'
                );
            END IF;

            UPDATE public.shops
               SET name = p_name,
                   description = p_description,
                   address = p_address,
                   phone = p_phone,
                   whatsapp = p_whatsapp,
                   city_id = p_city_id,
                   area_id = p_area_id,
                   category = p_category,
                   business_type = p_business_type,
                   latitude = p_latitude,
                   longitude = p_longitude,
                   id_type = p_id_type,
                   id_number = p_id_number,
                   cac_number = p_cac_number,
                   image_url = p_image_url,
                   storefront_url = p_storefront_url,
                   id_card_url = p_id_card_url,
                   cac_certificate_url = p_cac_certificate_url,
                   kyc_video_url = CASE
                       WHEN p_kyc_video_url IS NOT NULL THEN p_kyc_video_url
                       ELSE kyc_video_url
                   END,
                   facebook_url = p_facebook_url,
                   instagram_url = p_instagram_url,
                   twitter_url = p_twitter_url,
                   tiktok_url = p_tiktok_url,
                   telegram_url = p_telegram_url,
                   website_url = p_website_url,
                   is_service = coalesce(p_is_service, false),
                   kyc_status = CASE
                       WHEN p_kyc_video_url IS NOT NULL THEN 'submitted'::text
                       ELSE kyc_status
                   END,
                   status = 'pending'::application_status,
                   rejection_reason = NULL,
                   updated_at = v_now
             WHERE id = v_existing_shop.id
               AND owner_id = v_user_id
             RETURNING id INTO v_shop_id;
        ELSE
            IF p_shop_id IS NOT NULL THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'SHOP_NOT_FOUND',
                    'message', 'Business profile not found or access denied.'
                );
            END IF;

            INSERT INTO public.shops (
                owner_id,
                name,
                description,
                address,
                phone,
                whatsapp,
                city_id,
                area_id,
                category,
                business_type,
                latitude,
                longitude,
                id_type,
                id_number,
                cac_number,
                image_url,
                storefront_url,
                id_card_url,
                cac_certificate_url,
                kyc_video_url,
                facebook_url,
                instagram_url,
                twitter_url,
                tiktok_url,
                telegram_url,
                website_url,
                is_service,
                kyc_status,
                status
            ) VALUES (
                v_user_id,
                p_name,
                p_description,
                p_address,
                p_phone,
                p_whatsapp,
                p_city_id,
                p_area_id,
                p_category,
                p_business_type,
                p_latitude,
                p_longitude,
                p_id_type,
                p_id_number,
                p_cac_number,
                p_image_url,
                p_storefront_url,
                p_id_card_url,
                p_cac_certificate_url,
                p_kyc_video_url,
                p_facebook_url,
                p_instagram_url,
                p_twitter_url,
                p_tiktok_url,
                p_telegram_url,
                p_website_url,
                coalesce(p_is_service, false),
                CASE WHEN p_kyc_video_url IS NOT NULL THEN 'submitted'::text ELSE 'unsubmitted'::text END,
                'pending'::application_status
            )
            RETURNING id INTO v_shop_id;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'shop_id', v_shop_id,
            'is_service', coalesce(p_is_service, false),
            'message', CASE
              WHEN coalesce(p_is_service, false) THEN 'Service profile saved successfully.'
              ELSE 'Shop profile saved successfully.'
            END
        );
    EXCEPTION
        WHEN unique_violation THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'SHOP_UNIQUE_CONFLICT',
                'message', 'A business with this name or RC number already exists. Please choose a unique business name.'
            );
        WHEN OTHERS THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'SHOP_SAVE_FAILED',
                'message', SQLERRM
            );
    END;
END;
$$;

REVOKE ALL ON FUNCTION private.register_or_update_shop(
  text, text, text, text, text, bigint, bigint, text, text,
  double precision, double precision, text, text, text, text, text,
  text, text, text, text, text, text, text, text, bigint, text, boolean
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.register_or_update_shop(
  text, text, text, text, text, bigint, bigint, text, text,
  double precision, double precision, text, text, text, text, text,
  text, text, text, text, text, text, text, text, bigint, text, boolean
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_or_update_shop(
    p_name text,
    p_description text DEFAULT NULL,
    p_address text DEFAULT NULL,
    p_phone text DEFAULT NULL,
    p_whatsapp text DEFAULT NULL,
    p_city_id bigint DEFAULT NULL,
    p_area_id bigint DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_business_type text DEFAULT NULL,
    p_latitude double precision DEFAULT NULL,
    p_longitude double precision DEFAULT NULL,
    p_id_type text DEFAULT NULL,
    p_id_number text DEFAULT NULL,
    p_cac_number text DEFAULT NULL,
    p_image_url text DEFAULT NULL,
    p_storefront_url text DEFAULT NULL,
    p_id_card_url text DEFAULT NULL,
    p_cac_certificate_url text DEFAULT NULL,
    p_kyc_video_url text DEFAULT NULL,
    p_facebook_url text DEFAULT NULL,
    p_instagram_url text DEFAULT NULL,
    p_twitter_url text DEFAULT NULL,
    p_tiktok_url text DEFAULT NULL,
    p_website_url text DEFAULT NULL,
    p_shop_id bigint DEFAULT NULL,
    p_telegram_url text DEFAULT NULL,
    p_is_service boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
  SELECT private.register_or_update_shop(
    p_name,
    p_description,
    p_address,
    p_phone,
    p_whatsapp,
    p_city_id,
    p_area_id,
    p_category,
    p_business_type,
    p_latitude,
    p_longitude,
    p_id_type,
    p_id_number,
    p_cac_number,
    p_image_url,
    p_storefront_url,
    p_id_card_url,
    p_cac_certificate_url,
    p_kyc_video_url,
    p_facebook_url,
    p_instagram_url,
    p_twitter_url,
    p_tiktok_url,
    p_website_url,
    p_shop_id,
    p_telegram_url,
    p_is_service
  );
$$;

REVOKE ALL ON FUNCTION public.register_or_update_shop(
  text, text, text, text, text, bigint, bigint, text, text,
  double precision, double precision, text, text, text, text, text,
  text, text, text, text, text, text, text, text, bigint, text, boolean
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_or_update_shop(
  text, text, text, text, text, bigint, bigint, text, text,
  double precision, double precision, text, text, text, text, text,
  text, text, text, text, text, text, text, text, bigint, text, boolean
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.get_dashboard_payload(
  p_user_id uuid,
  p_city_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
        LEFT JOIN public.shops s
          ON s.id = b.shop_id
        WHERE b.city_id = p_city_id
          AND b.status = 'published'
          AND (b.starts_at IS NULL OR b.starts_at <= v_now)
          AND (b.ends_at IS NULL OR b.ends_at >= v_now)
          AND (
            b.shop_id IS NULL OR (
              coalesce(s.is_service, false) = false
              AND s.status = 'approved'::public.application_status
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
        JOIN public.products p
          ON p.id::text = sp.template_key
        JOIN public.shops s
          ON s.id = p.shop_id
        WHERE sp.status = 'published'
          AND sp.layout = 'product'
          AND sp.city_id = p_city_id
          AND p.is_approved = true
          AND p.is_available = true
          AND coalesce(s.is_service, false) = false
          AND s.status = 'approved'::public.application_status
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
          AND coalesce(is_service, false) = false
          AND status = 'approved'::public.application_status
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
        JOIN public.shops s
          ON s.id = p.shop_id
        WHERE s.city_id = p_city_id
          AND p.is_approved = true
          AND p.is_available = true
          AND coalesce(s.is_service, false) = false
          AND s.status = 'approved'::public.application_status
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
          s.name AS shop_name,
          s.city_id AS shop_city_id
        FROM public.products p
        JOIN public.shops s
          ON s.id = p.shop_id
        WHERE s.city_id = p_city_id
          AND p.condition = 'Fairly Used'
          AND p.is_available = true
          AND p.is_approved = true
          AND coalesce(s.is_service, false) = false
          AND s.status = 'approved'::public.application_status
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

REVOKE ALL ON FUNCTION private.get_dashboard_payload(uuid, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_dashboard_payload(uuid, bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_dashboard_payload(
  p_user_id uuid,
  p_city_id bigint
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
  SELECT private.get_dashboard_payload(p_user_id, p_city_id);
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_payload(uuid, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_payload(uuid, bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
