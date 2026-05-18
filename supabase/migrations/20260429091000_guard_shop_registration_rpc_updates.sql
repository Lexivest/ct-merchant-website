-- Prevent stale "new shop registration" screens from overwriting an existing
-- merchant shop. Existing shops can only be corrected through an explicit shop id.

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
    p_shop_id bigint DEFAULT NULL
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
                    'message', 'A shop already exists for this account. Open your dashboard or correction form instead.'
                );
            END IF;

            IF v_existing_shop.id <> p_shop_id THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'SHOP_ACCESS_DENIED',
                    'message', 'Shop not found or access denied.'
                );
            END IF;

            IF v_existing_shop.status <> 'rejected'::application_status THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'SHOP_SUBMISSION_LOCKED',
                    'shop_id', v_existing_shop.id,
                    'status', v_existing_shop.status,
                    'message', 'This shop registration is locked and cannot be resubmitted right now.'
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
                   website_url = p_website_url,
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
                    'message', 'Shop not found or access denied.'
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
                website_url,
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
                p_website_url,
                CASE WHEN p_kyc_video_url IS NOT NULL THEN 'submitted'::text ELSE 'unsubmitted'::text END,
                'pending'::application_status
            )
            RETURNING id INTO v_shop_id;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'shop_id', v_shop_id,
            'message', 'Shop profile saved successfully.'
        );
    EXCEPTION
        WHEN unique_violation THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'SHOP_UNIQUE_CONFLICT',
                'message', 'A shop with this name or RC number already exists. Please choose a unique business name.'
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

DROP FUNCTION IF EXISTS public.register_or_update_shop(
  text, text, text, text, text, bigint, bigint, text, text,
  double precision, double precision, text, text, text, text, text,
  text, text, text, text, text, text, text, text
);

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
    p_shop_id bigint DEFAULT NULL
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
    p_shop_id
  );
$$;

REVOKE ALL ON FUNCTION public.register_or_update_shop(
  text, text, text, text, text, bigint, bigint, text, text,
  double precision, double precision, text, text, text, text, text,
  text, text, text, text, text, text, text, text, bigint
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_or_update_shop(
  text, text, text, text, text, bigint, bigint, text, text,
  double precision, double precision, text, text, text, text, text,
  text, text, text, text, text, text, text, text, bigint
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
