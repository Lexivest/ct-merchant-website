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
  v_existing_physical record;
  v_code_exists boolean := false;
BEGIN
  SELECT *
  INTO v_existing_physical
  FROM public.physical_verification_payments
  WHERE merchant_id = p_merchant_id
    AND status = 'success'
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Verification fee already confirmed. You can continue to video KYC.'
    );
  END IF;

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

CREATE OR REPLACE FUNCTION public.process_offline_payment_review(
  p_proof_id bigint,
  p_staff_id uuid,
  p_action text,
  p_note text,
  p_payment_ref text DEFAULT NULL::text,
  p_amount numeric DEFAULT NULL::numeric,
  p_plan_key text DEFAULT NULL::text,
  p_new_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_merchant_name text DEFAULT NULL::text,
  p_shop_name text DEFAULT NULL::text,
  p_city_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_proof record;
  v_existing_physical record;
  v_final_ref text;
  v_shop_name text := coalesce(nullif(trim(p_shop_name), ''), 'your shop');
  v_plan_label text := CASE p_plan_key
    WHEN '6_Months' THEN '6-month service plan'
    WHEN '1_Year' THEN '1-year service plan'
    ELSE 'service plan'
  END;
  v_end_date_label text := CASE
    WHEN p_new_end_date IS NOT NULL THEN to_char(p_new_end_date AT TIME ZONE 'Africa/Lagos', 'DD Mon YYYY')
    ELSE NULL
  END;
BEGIN
  SELECT * INTO v_proof
  FROM public.offline_payment_proofs
  WHERE id = p_proof_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment proof not found.';
  END IF;

  IF v_proof.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'status', v_proof.status,
      'message', 'Payment proof is already ' || v_proof.status
    );
  END IF;

  IF p_action = 'reject' THEN
    UPDATE public.offline_payment_proofs
    SET status = 'rejected',
        review_note = p_note,
        reviewed_by = p_staff_id,
        reviewed_at = now()
    WHERE id = p_proof_id;

    IF v_proof.payment_kind = 'physical_verification' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Verification Receipt Needs Attention',
        'We could not confirm your physical verification payment for "' || v_shop_name || '".'
        || CASE
            WHEN nullif(trim(coalesce(p_note, '')), '') IS NOT NULL THEN ' Staff note: ' || trim(p_note) || '.'
            ELSE ''
           END
        || ' Please upload a clearer receipt or contact support if the transfer has already reached us.',
        'verification_payment_rejected',
        '/remita?shop_id=' || v_proof.shop_id::text
      );
    ELSIF v_proof.payment_kind = 'service_fee' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Service Fee Receipt Needs Attention',
        'We could not confirm the service fee payment for "' || v_shop_name || '".'
        || CASE
            WHEN nullif(trim(coalesce(p_note, '')), '') IS NOT NULL THEN ' Staff note: ' || trim(p_note) || '.'
            ELSE ''
           END
        || ' Please upload a clearer receipt or contact support if payment has already been made.',
        'service_fee_rejected',
        '/service-fee?shop_id=' || v_proof.shop_id::text
      );
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'message', 'Payment proof rejected.');
  END IF;

  IF p_action = 'approve' THEN
    v_final_ref := p_payment_ref;

    IF v_proof.payment_kind = 'physical_verification' THEN
      SELECT * INTO v_existing_physical
      FROM public.physical_verification_payments
      WHERE merchant_id = v_proof.merchant_id AND status = 'success'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.physical_verification_payments (
          merchant_id, merchant_name, shop_name, city, amount, payment_ref, status
        ) VALUES (
          v_proof.merchant_id, p_merchant_name, p_shop_name, p_city_name, p_amount, v_final_ref, 'success'
        );
      ELSE
        v_final_ref := coalesce(nullif(trim(coalesce(v_existing_physical.payment_ref, '')), ''), v_final_ref);
      END IF;

    ELSIF v_proof.payment_kind = 'service_fee' THEN
      UPDATE public.shops
      SET subscription_plan = p_plan_key,
          subscription_end_date = p_new_end_date
      WHERE id = v_proof.shop_id AND owner_id = v_proof.merchant_id;

      INSERT INTO public.service_fee_payments (
        merchant_id, shop_id, amount, plan, payment_ref, status
      ) VALUES (
        v_proof.merchant_id, v_proof.shop_id, p_amount, p_plan_key, v_final_ref, 'success'
      );
    ELSE
      RAISE EXCEPTION 'Unknown payment kind: %', v_proof.payment_kind;
    END IF;

    UPDATE public.offline_payment_proofs
    SET status = 'approved',
        review_note = COALESCE(p_note, 'Payment confirmed by staff.'),
        reviewed_by = p_staff_id,
        reviewed_at = now(),
        approval_payment_ref = v_final_ref
    WHERE id = p_proof_id;

    IF v_proof.payment_kind = 'physical_verification' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Verification Fee Confirmed',
        'We have confirmed your physical verification payment for "' || v_shop_name || '". You can now continue to video KYC.',
        'verification_payment_confirmed',
        '/merchant-video-kyc?shop_id=' || v_proof.shop_id::text
      );
    ELSIF v_proof.payment_kind = 'service_fee' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Service Fee Confirmed',
        '"' || v_shop_name || '" is now on the ' || v_plan_label
        || CASE
            WHEN v_end_date_label IS NOT NULL THEN ' and remains active until ' || v_end_date_label || '.'
            ELSE '.'
           END,
        'service_fee_confirmed',
        '/vendor-panel'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'approved',
      'paymentRef', v_final_ref,
      'plan', p_plan_key,
      'subscriptionEndDate', p_new_end_date,
      'message', 'Payment proof approved successfully.'
    );
  END IF;

  RAISE EXCEPTION 'Invalid action parameter.';
END;
$$;
