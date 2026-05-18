-- Update the Shop Management RPC to include all fields required by the frontend
-- and ensure it handles the full registration/update flow.

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
    p_latitude numeric DEFAULT NULL,
    p_longitude numeric DEFAULT NULL,
    p_id_type text DEFAULT NULL,
    p_id_number text DEFAULT NULL,
    p_cac_number text DEFAULT NULL,
    p_image_url text DEFAULT NULL,
    p_storefront_url text DEFAULT NULL,
    p_id_card_url text DEFAULT NULL,
    p_cac_certificate_url text DEFAULT NULL,
    p_video_kyc_url text DEFAULT NULL,
    p_facebook_url text DEFAULT NULL,
    p_instagram_url text DEFAULT NULL,
    p_twitter_url text DEFAULT NULL,
    p_tiktok_url text DEFAULT NULL,
    p_website_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_shop_id bigint;
    v_existing_shop RECORD;
    v_now timestamp with time zone := now();
BEGIN
    -- 1. Ensure user is authenticated
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- 2. Check for existing shop (one shop per user)
    SELECT * INTO v_existing_shop FROM public.shops WHERE owner_id = v_user_id;

    IF v_existing_shop.id IS NOT NULL THEN
        -- UPDATE EXISTING SHOP
        
        -- Security: If already approved, protect critical identity fields
        IF v_existing_shop.status = 'approved' THEN
            p_name := v_existing_shop.name;
            p_phone := v_existing_shop.phone;
            p_whatsapp := v_existing_shop.whatsapp;
            p_cac_number := v_existing_shop.cac_number;
            p_id_number := v_existing_shop.id_number;
            p_business_type := v_existing_shop.business_type;
        END IF;

        UPDATE public.shops
        SET
            name = p_name,
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
            video_kyc_url = CASE WHEN p_video_kyc_url IS NOT NULL THEN p_video_kyc_url ELSE video_kyc_url END,
            facebook_url = p_facebook_url,
            instagram_url = p_instagram_url,
            twitter_url = p_twitter_url,
            tiktok_url = p_tiktok_url,
            website_url = p_website_url,
            kyc_status = CASE WHEN p_video_kyc_url IS NOT NULL THEN 'submitted'::text ELSE kyc_status END,
            status = CASE WHEN status = 'rejected' THEN 'pending'::application_status ELSE status END,
            rejection_reason = CASE WHEN status = 'rejected' THEN NULL ELSE rejection_reason END,
            updated_at = v_now
        WHERE id = v_existing_shop.id
        RETURNING id INTO v_shop_id;
    ELSE
        -- REGISTER NEW SHOP
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
            video_kyc_url,
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
            p_video_kyc_url,
            p_facebook_url,
            p_instagram_url,
            p_twitter_url,
            p_tiktok_url,
            p_website_url,
            CASE WHEN p_video_kyc_url IS NOT NULL THEN 'submitted'::text ELSE 'unsubmitted'::text END,
            'pending'::application_status
        )
        RETURNING id INTO v_shop_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'shop_id', v_shop_id,
        'message', 'Shop profile saved successfully.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_or_update_shop(text, text, text, text, text, bigint, bigint, text, text, numeric, numeric, text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;
