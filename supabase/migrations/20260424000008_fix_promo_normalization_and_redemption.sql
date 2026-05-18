UPDATE public.promo_codes
SET code = regexp_replace(upper(trim(coalesce(code, ''))), '[^A-Z0-9]', '', 'g')
WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.redeem_verification_promo_code(
  p_merchant_id uuid,
  p_code text,
  p_shop_id bigint DEFAULT NULL,
  p_merchant_name text DEFAULT NULL,
  p_shop_name text DEFAULT NULL,
  p_city_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_normalized_code text := regexp_replace(upper(trim(coalesce(p_code, ''))), '[^A-Z0-9]', '', 'g');
  v_payment_ref text;
  v_shop_name text := coalesce(nullif(trim(p_shop_name), ''), 'your shop');
  v_promo_id uuid;
  v_existing_payment_merchant uuid;
  v_code_exists boolean := false;
BEGIN
  IF length(v_normalized_code) <> 6 THEN
    RAISE EXCEPTION 'Promo code must be 6 alphanumeric characters.';
  END IF;

  v_payment_ref := 'PROMO_' || v_normalized_code;

  SELECT merchant_id
  INTO v_existing_payment_merchant
  FROM public.physical_verification_payments
  WHERE payment_ref = v_payment_ref
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_payment_merchant IS NOT NULL THEN
    IF v_existing_payment_merchant = p_merchant_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'message', 'Promo code already verified.'
      );
    END IF;

    RAISE EXCEPTION 'Invalid or already used promo code.';
  END IF;

  SELECT p.id
  INTO v_promo_id
  FROM public.promo_codes p
  WHERE (
      trim(coalesce(p.code, '')) = trim(coalesce(p_code, ''))
      OR upper(trim(coalesce(p.code, ''))) = upper(trim(coalesce(p_code, '')))
      OR regexp_replace(upper(trim(coalesce(p.code, ''))), '[^A-Z0-9]', '', 'g') = v_normalized_code
    )
    AND coalesce(p.is_used, false) = false
  ORDER BY p.created_at ASC, p.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_promo_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.promo_codes p
      WHERE
        trim(coalesce(p.code, '')) = trim(coalesce(p_code, ''))
        OR upper(trim(coalesce(p.code, ''))) = upper(trim(coalesce(p_code, '')))
        OR regexp_replace(upper(trim(coalesce(p.code, ''))), '[^A-Z0-9]', '', 'g') = v_normalized_code
    )
    INTO v_code_exists;

    IF v_code_exists THEN
      RAISE EXCEPTION 'Invalid or already used promo code.';
    END IF;

    RAISE EXCEPTION 'Promo code not found.';
  END IF;

  UPDATE public.promo_codes
  SET
    code = v_normalized_code,
    is_used = true,
    used_by = p_merchant_id,
    used_at = now()
  WHERE id = v_promo_id;

  INSERT INTO public.physical_verification_payments (
    merchant_id,
    merchant_name,
    shop_name,
    city,
    amount,
    payment_ref,
    status
  )
  VALUES (
    p_merchant_id,
    p_merchant_name,
    p_shop_name,
    p_city_name,
    0,
    v_payment_ref,
    'success'
  );

  PERFORM public.push_user_notification(
    p_merchant_id,
    'Verification Fee Confirmed',
    'Your promo code has been accepted for "' || v_shop_name || '". You can now continue to video KYC.',
    'verification_payment_confirmed',
    CASE
      WHEN p_shop_id IS NOT NULL THEN '/merchant-video-kyc?shop_id=' || p_shop_id::text
      ELSE '/vendor-panel'
    END
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Promo code successfully redeemed and verification recorded.'
  );
END;
$$;
