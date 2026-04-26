CREATE OR REPLACE FUNCTION public.redeem_verification_promo_code_self(
  p_code text,
  p_shop_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_shop record;
  v_profile record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_shop_id IS NULL THEN
    RAISE EXCEPTION 'Shop ID is required.';
  END IF;

  IF nullif(trim(coalesce(p_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Promo code is required.';
  END IF;

  SELECT
    s.id,
    s.owner_id,
    s.name,
    s.status,
    s.is_verified,
    s.city_id
  INTO v_shop
  FROM public.shops s
  WHERE s.id = p_shop_id
    AND s.owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found or access denied.';
  END IF;

  IF v_shop.is_verified IS TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Your shop is already physically verified.'
    );
  END IF;

  IF coalesce(v_shop.status, '') <> 'approved' THEN
    RAISE EXCEPTION 'Your shop must be digitally approved before promo verification can continue.';
  END IF;

  SELECT
    p.full_name,
    c.name AS city_name
  INTO v_profile
  FROM public.profiles p
  LEFT JOIN public.cities c ON c.id = p.city_id
  WHERE p.id = v_user_id;

  RETURN public.redeem_verification_promo_code(
    p_merchant_id => v_user_id,
    p_code => upper(trim(p_code)),
    p_shop_id => v_shop.id,
    p_merchant_name => coalesce(nullif(trim(coalesce(v_profile.full_name, '')), ''), 'Merchant'),
    p_shop_name => coalesce(nullif(trim(coalesce(v_shop.name, '')), ''), 'Unknown Shop'),
    p_city_name => coalesce(nullif(trim(coalesce(v_profile.city_name, '')), ''), 'Unknown City')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_verification_promo_code_self(text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_verification_promo_code_self(text, bigint) TO authenticated, service_role;
