-- 1. Create a robust Shop Management RPC
-- This function handles shop registration and updates, ensures one shop per user,
-- and manages KYC submission logic.

CREATE OR REPLACE FUNCTION public.register_or_update_shop(
    p_name text,
    p_description text DEFAULT NULL,
    p_address text DEFAULT NULL,
    p_phone text DEFAULT NULL,
    p_whatsapp text DEFAULT NULL,
    p_city_id bigint DEFAULT NULL,
    p_area_id bigint DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_cac_number text DEFAULT NULL,
    p_id_number text DEFAULT NULL,
    p_video_kyc_url text DEFAULT NULL
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
        
        -- Security: If already approved, protect critical fields (as per user request)
        IF v_existing_shop.status = 'approved' THEN
            p_name := v_existing_shop.name;
            p_phone := v_existing_shop.phone;
            p_whatsapp := v_existing_shop.whatsapp;
            p_cac_number := v_existing_shop.cac_number;
            p_id_number := v_existing_shop.id_number;
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
            cac_number = p_cac_number,
            id_number = p_id_number,
            video_kyc_url = CASE WHEN p_video_kyc_url IS NOT NULL THEN p_video_kyc_url ELSE video_kyc_url END,
            kyc_status = CASE WHEN p_video_kyc_url IS NOT NULL THEN 'submitted'::text ELSE kyc_status END,
            status = CASE WHEN status = 'rejected' THEN 'pending'::application_status ELSE status END,
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
            cac_number,
            id_number,
            video_kyc_url,
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
            p_cac_number,
            p_id_number,
            p_video_kyc_url,
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

-- 2. Update handle_shop_verification trigger to delete video on approval
-- Note: SQL cannot delete from storage directly easily without extensions, 
-- but we can clear the URL and leave a marker or assume the client/edge-func handles the physical deletion.
-- However, we can implement the logic to clear the URL here.

CREATE OR REPLACE FUNCTION public.handle_shop_verification_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    -- If shop is approved, and was not approved before
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        -- Clear video KYC URL on approval as requested
        NEW.video_kyc_url := NULL;
        NEW.is_verified := true;
    END IF;

    -- If kyc_status is approved
    IF NEW.kyc_status = 'approved' AND OLD.kyc_status != 'approved' THEN
        NEW.is_verified := true;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_shop_verification ON public.shops;
CREATE TRIGGER on_shop_verification
    BEFORE UPDATE ON public.shops
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_shop_verification_updated();


-- 3. Fix get_dashboard_payload to respect RLS and return products for cards
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
                  -- Ensure shop is active if linked
                  AND (b.shop_id IS NULL OR (
                      s.status = 'approved' AND s.is_verified = true AND s.is_open = true AND s.subscription_end_date > v_now
                  ))
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
                  -- Ensure product is approved and shop is active
                  AND p.is_approved = true
                  AND s.status = 'approved' AND s.is_verified = true AND s.is_open = true AND s.subscription_end_date > v_now
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
                  AND status = 'approved'
                  AND is_verified = true
                  AND is_open = true
                  AND subscription_end_date > v_now
                ORDER BY is_featured DESC, is_verified DESC
                LIMIT 100
            ) s
        ),
        -- NEW: Products for the shop cards in MarketSection
        'products', (
            SELECT coalesce(jsonb_agg(p), '[]'::jsonb)
            FROM (
                SELECT p.*
                FROM public.products p
                JOIN public.shops s ON p.shop_id = s.id
                WHERE s.city_id = p_city_id
                  AND p.is_approved = true
                  AND p.is_available = true
                  AND s.status = 'approved'
                  AND s.is_verified = true
                  AND s.is_open = true
                  AND s.subscription_end_date > v_now
                ORDER BY p.created_at DESC
                LIMIT 400
            ) p
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
                  AND p.is_approved = true
                  AND s.status = 'approved'
                  AND s.is_verified = true
                  AND s.is_open = true
                  AND s.subscription_end_date > v_now
                ORDER BY p.created_at DESC
                LIMIT 24
            ) p
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;


-- 4. Fix get_shop_detail_payload to respect RLS
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
    v_is_owner boolean;
    v_is_admin boolean;
    v_now timestamp with time zone := now();
BEGIN
    -- 1. Authentication Check (Strictly Authenticated Only as requested)
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    v_is_owner := EXISTS (SELECT 1 FROM shops WHERE id = p_shop_id AND owner_id = p_user_id);
    v_is_admin := EXISTS (SELECT 1 FROM admins WHERE id = p_user_id);

    -- 2. Visibility Check: Check if shop exists and meets visibility criteria (unless owner/admin)
    IF NOT v_is_owner AND NOT v_is_admin THEN
        IF NOT EXISTS (
            SELECT 1 FROM shops 
            WHERE id = p_shop_id 
              AND status = 'approved' 
              AND is_verified = true 
              AND is_open = true 
              AND subscription_end_date > v_now
        ) THEN
            RAISE EXCEPTION 'Shop not found or inactive' USING ERRCODE = 'P0002';
        END IF;
    END IF;

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
                  AND (is_approved = true OR v_is_owner OR v_is_admin)
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

    -- Record view if authenticated and not owner
    IF p_user_id IS NOT NULL AND NOT v_is_owner THEN
        INSERT INTO shop_views (shop_id, viewer_id)
        VALUES (p_shop_id, p_user_id)
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN v_result;
END;
$$;

-- 5. Fix get_product_detail_payload to respect RLS
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
    v_shop_id bigint;
    v_is_owner boolean;
    v_is_admin boolean;
    v_now timestamp with time zone := now();
BEGIN
    -- 1. Authentication Check
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- Get product basic info for authorization
    SELECT category, shop_id INTO v_category, v_shop_id FROM products WHERE id = p_product_id;
    
    v_is_owner := EXISTS (SELECT 1 FROM shops WHERE id = v_shop_id AND owner_id = p_user_id);
    v_is_admin := EXISTS (SELECT 1 FROM admins WHERE id = p_user_id);

    -- 2. Visibility Check (unless owner/admin)
    IF NOT v_is_owner AND NOT v_is_admin THEN
        IF NOT EXISTS (
            SELECT 1 FROM products p
            JOIN shops s ON p.shop_id = s.id
            WHERE p.id = p_product_id
              AND p.is_approved = true
              AND s.status = 'approved'
              AND s.is_verified = true
              AND s.is_open = true
              AND s.subscription_end_date > v_now
        ) THEN
            RAISE EXCEPTION 'Product not found or unavailable' USING ERRCODE = 'P0002';
        END IF;
    END IF;

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
                SELECT p.id, p.name, p.price, p.discount_price, p.image_url
                FROM products p
                JOIN shops s ON p.shop_id = s.id
                WHERE p.category = v_category
                  AND p.id != p_product_id
                  AND p.is_available = true
                  AND p.is_approved = true
                  AND s.status = 'approved'
                  AND s.is_verified = true
                  AND s.subscription_end_date > v_now
                LIMIT 10
            ) r
        ),
        'initial_wishlist', (
            EXISTS (SELECT 1 FROM wishlist WHERE user_id = p_user_id AND product_id = p_product_id)
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 6. Create a robust Product Management RPC
CREATE OR REPLACE FUNCTION public.manage_product(
    p_product_id bigint DEFAULT NULL,
    p_shop_id bigint DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_price numeric DEFAULT NULL,
    p_discount_price numeric DEFAULT NULL,
    p_condition text DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_image_url text DEFAULT NULL,
    p_image_url_2 text DEFAULT NULL,
    p_image_url_3 text DEFAULT NULL,
    p_stock_count integer DEFAULT 1,
    p_attributes jsonb DEFAULT '{}'::jsonb,
    p_is_available boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_target_shop_id bigint;
    v_final_product_id bigint;
    v_existing_product RECORD;
    v_shop RECORD;
    v_now timestamp with time zone := now();
BEGIN
    -- 1. Authentication
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- 2. Determine target shop and validate ownership
    IF p_product_id IS NOT NULL THEN
        SELECT * INTO v_existing_product FROM public.products WHERE id = p_product_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
        END IF;
        v_target_shop_id := v_existing_product.shop_id;
    ELSE
        v_target_shop_id := p_shop_id;
    END IF;

    IF v_target_shop_id IS NULL THEN
        RAISE EXCEPTION 'Shop ID is required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_shop FROM public.shops WHERE id = v_target_shop_id AND owner_id = v_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Access denied: You do not own this shop' USING ERRCODE = '42501';
    END IF;

    -- 3. Business Rules
    -- Limit 30 products per shop (only for new products)
    IF p_product_id IS NULL AND (SELECT count(*) FROM public.products WHERE shop_id = v_target_shop_id) >= 30 THEN
        RAISE EXCEPTION 'Product limit reached (max 30)' USING ERRCODE = '42501';
    END IF;

    -- Ensure subscription is active for new products or making available
    IF (v_shop.subscription_end_date IS NULL OR v_shop.subscription_end_date < v_now) THEN
         RAISE EXCEPTION 'Active subscription required' USING ERRCODE = '42501';
    END IF;

    -- 4. Execute Action
    IF p_product_id IS NOT NULL THEN
        -- UPDATE
        UPDATE public.products
        SET
            name = COALESCE(p_name, name),
            description = COALESCE(p_description, description),
            price = COALESCE(p_price, price),
            discount_price = p_discount_price, -- Allow setting to NULL
            condition = COALESCE(p_condition, condition),
            category = COALESCE(p_category, category),
            image_url = COALESCE(p_image_url, image_url),
            image_url_2 = p_image_url_2,
            image_url_3 = p_image_url_3,
            stock_count = COALESCE(p_stock_count, stock_count),
            attributes = COALESCE(p_attributes, attributes),
            is_available = COALESCE(p_is_available, is_available),
            -- Auto-reset status on modification is handled by the trigger
            updated_at = v_now
        WHERE id = p_product_id
        RETURNING id INTO v_final_product_id;
    ELSE
        -- INSERT
        -- Note: We need a way to generate IDs if not using identity. 
        -- Assuming products use a sequence or the app provides it. 
        -- Baseline shows "id" bigint NOT NULL without DEFAULT nextval in some places, 
        -- but usually it's a sequence. Let's use the sequence if it exists.
        INSERT INTO public.products (
            shop_id,
            name,
            description,
            price,
            discount_price,
            condition,
            category,
            image_url,
            image_url_2,
            image_url_3,
            stock_count,
            attributes,
            is_available,
            is_approved
        ) VALUES (
            v_target_shop_id,
            p_name,
            p_description,
            p_price,
            p_discount_price,
            p_condition,
            p_category,
            p_image_url,
            p_image_url_2,
            p_image_url_3,
            p_stock_count,
            p_attributes,
            p_is_available,
            false -- Always starts as unapproved
        )
        RETURNING id INTO v_final_product_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'product_id', v_final_product_id,
        'message', 'Product saved successfully.'
    );
END;
$$;

-- 7. Update Product Protection Trigger
CREATE OR REPLACE FUNCTION public.protect_product_admin_columns_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    -- Only restrict if the user is NOT an admin
    IF NOT EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()) THEN
        -- Revert shop_id changes
        IF TG_OP = 'UPDATE' THEN
            NEW.shop_id := OLD.shop_id;
        END IF;

        -- Auto-reset approval if critical fields change
        IF TG_OP = 'INSERT' THEN
            NEW.is_approved := false;
            NEW.rejection_reason := NULL;
        ELSIF TG_OP = 'UPDATE' THEN
            -- Prevent manual approval
            IF NEW.is_approved = true AND OLD.is_approved = false THEN
                NEW.is_approved := false;
            END IF;

            -- If content changes, reset approval
            IF (NEW.name IS DISTINCT FROM OLD.name) OR
               (NEW.description IS DISTINCT FROM OLD.description) OR
               (NEW.image_url IS DISTINCT FROM OLD.image_url) OR
               (NEW.image_url_2 IS DISTINCT FROM OLD.image_url_2) OR
               (NEW.image_url_3 IS DISTINCT FROM OLD.image_url_3) OR
               (NEW.price IS DISTINCT FROM OLD.price) OR
               (NEW.discount_price IS DISTINCT FROM OLD.discount_price)
            THEN
                NEW.is_approved := false;
                NEW.rejection_reason := NULL;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_product_admin_columns ON public.products;
CREATE TRIGGER protect_product_admin_columns
    BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_product_admin_columns_updated();

-- Permissions
GRANT EXECUTE ON FUNCTION public.manage_product(bigint, bigint, text, text, numeric, numeric, text, text, text, text, text, integer, jsonb, boolean) TO authenticated;
