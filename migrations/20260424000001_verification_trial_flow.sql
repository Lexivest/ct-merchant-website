-- Move the free-trial activation from shop creation to successful KYC approval.

ALTER TABLE public.shops
  ALTER COLUMN subscription_plan DROP DEFAULT;

ALTER TABLE public.shops
  ALTER COLUMN subscription_end_date DROP DEFAULT;

DROP TRIGGER IF EXISTS on_new_shop_subscription ON public.shops;

CREATE OR REPLACE FUNCTION public.handle_new_shop_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_shop_verification_updated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.kyc_status = 'approved' AND COALESCE(OLD.kyc_status, '') <> 'approved' THEN
    NEW.is_verified := true;
    NEW.kyc_video_url := NULL;
  END IF;

  IF COALESCE(NEW.is_verified, false) = true AND COALESCE(OLD.is_verified, false) = false THEN
    IF NEW.subscription_end_date IS NULL OR NEW.subscription_end_date <= now() THEN
      NEW.subscription_plan := 'Free Trial';
      NEW.subscription_end_date := now() + INTERVAL '30 days';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.shops
SET
  subscription_plan = NULL,
  subscription_end_date = NULL
WHERE COALESCE(is_verified, false) = false
  AND subscription_plan = 'Free Trial';

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
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

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

    SELECT * INTO v_shop
    FROM public.shops
    WHERE id = v_target_shop_id
      AND owner_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Access denied: You do not own this shop' USING ERRCODE = '42501';
    END IF;

    IF COALESCE(v_shop.is_open, true) = false THEN
        RAISE EXCEPTION 'Shop is suspended.' USING ERRCODE = '42501';
    END IF;

    IF v_shop.status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION 'Shop must be digitally approved before products can be managed.' USING ERRCODE = '42501';
    END IF;

    IF p_product_id IS NULL
       AND (SELECT count(*) FROM public.products WHERE shop_id = v_target_shop_id) >= 30 THEN
        RAISE EXCEPTION 'Product limit reached (max 30)' USING ERRCODE = '42501';
    END IF;

    IF p_product_id IS NOT NULL THEN
        UPDATE public.products
        SET
            name = COALESCE(p_name, name),
            description = COALESCE(p_description, description),
            price = COALESCE(p_price, price),
            discount_price = p_discount_price,
            condition = COALESCE(p_condition, condition),
            category = COALESCE(p_category, category),
            image_url = COALESCE(p_image_url, image_url),
            image_url_2 = p_image_url_2,
            image_url_3 = p_image_url_3,
            stock_count = COALESCE(p_stock_count, stock_count),
            attributes = COALESCE(p_attributes, attributes),
            is_available = COALESCE(p_is_available, is_available),
            updated_at = v_now
        WHERE id = p_product_id
        RETURNING id INTO v_final_product_id;
    ELSE
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
            false
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

DROP POLICY IF EXISTS "CTM products insert" ON public.products;

CREATE POLICY "CTM products insert"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = products.shop_id
      AND (
        (
          s.owner_id = (SELECT auth.uid())
          AND s.status = 'approved'
          AND s.is_open = true
        )
        OR (SELECT public.ctm_has_super_staff_access())
        OR (
          (SELECT public.ctm_has_staff_access())
          AND s.city_id = (SELECT public.ctm_current_staff_city_scope())
        )
      )
  )
);
