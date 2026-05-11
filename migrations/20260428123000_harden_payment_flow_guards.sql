-- Harden payment proof intake and approval so payment state cannot depend on
-- merchant-supplied metadata or a single Edge Function validation path.

CREATE OR REPLACE FUNCTION public.protect_offline_payment_proof_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_auth_uid uuid := (SELECT auth.uid());
  v_auth_role text := (SELECT auth.role());
  v_shop record;
  v_profile_name text;
  v_expected_amount integer;
  v_receipt_prefix text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF v_auth_role = 'service_role' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Payment proofs cannot be updated directly.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF v_auth_role IS DISTINCT FROM 'service_role' THEN
    IF v_auth_uid IS NULL THEN
      RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    IF NEW.merchant_id IS DISTINCT FROM v_auth_uid THEN
      RAISE EXCEPTION 'Payment proof merchant mismatch.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT
    s.id,
    s.owner_id,
    s.name,
    s.status,
    s.is_verified,
    s.kyc_status
  INTO v_shop
  FROM public.shops s
  WHERE s.id = NEW.shop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found.';
  END IF;

  IF v_shop.owner_id IS DISTINCT FROM NEW.merchant_id THEN
    RAISE EXCEPTION 'Payment proof does not belong to the shop owner.' USING ERRCODE = '42501';
  END IF;

  NEW.payment_kind := lower(trim(coalesce(NEW.payment_kind, '')));
  NEW.plan := nullif(trim(coalesce(NEW.plan, '')), '');
  NEW.receipt_path := trim(coalesce(NEW.receipt_path, ''));
  NEW.receipt_url := NEW.receipt_path;
  NEW.status := 'pending';
  NEW.review_note := NULL;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.approval_payment_ref := NULL;
  NEW.depositor_name := nullif(left(trim(coalesce(NEW.depositor_name, '')), 120), '');
  NEW.transfer_reference := nullif(left(trim(coalesce(NEW.transfer_reference, '')), 120), '');

  IF NEW.payment_kind NOT IN ('physical_verification', 'service_fee') THEN
    RAISE EXCEPTION 'Invalid payment kind.';
  END IF;

  IF NEW.receipt_path = '' OR NEW.receipt_path LIKE '/%' OR position('..' in NEW.receipt_path) > 0 THEN
    RAISE EXCEPTION 'Invalid payment receipt path.';
  END IF;

  v_receipt_prefix := NEW.merchant_id::text || '/' || NEW.shop_id::text || '/';
  IF NEW.receipt_path NOT LIKE v_receipt_prefix || '%' THEN
    RAISE EXCEPTION 'Payment receipt path must match the merchant and shop.';
  END IF;

  IF NEW.payment_kind = 'physical_verification' THEN
    IF v_shop.status IS DISTINCT FROM 'approved'::public.application_status THEN
      RAISE EXCEPTION 'Shop must be digitally approved before physical verification payment proof can be submitted.';
    END IF;

    NEW.plan := NULL;
    v_expected_amount := 5000;
  ELSE
    IF NOT (coalesce(v_shop.is_verified, false) OR v_shop.kyc_status = 'approved') THEN
      RAISE EXCEPTION 'Shop must be physically verified before service fee payment proof can be submitted.';
    END IF;

    v_expected_amount := CASE NEW.plan
      WHEN '6_Months' THEN 6000
      WHEN '1_Year' THEN 10000
      ELSE NULL
    END;

    IF v_expected_amount IS NULL THEN
      RAISE EXCEPTION 'Invalid service fee plan.';
    END IF;
  END IF;

  IF NEW.amount IS DISTINCT FROM v_expected_amount THEN
    RAISE EXCEPTION 'Payment amount must match the selected payment type.';
  END IF;

  SELECT p.full_name
  INTO v_profile_name
  FROM public.profiles p
  WHERE p.id = NEW.merchant_id;

  NEW.merchant_name := coalesce(nullif(trim(v_profile_name), ''), nullif(trim(coalesce(NEW.merchant_name, '')), ''), 'Merchant');
  NEW.merchant_email := nullif(left(lower(trim(coalesce(NEW.merchant_email, ''))), 254), '');
  NEW.shop_name := coalesce(nullif(trim(v_shop.name), ''), nullif(trim(coalesce(NEW.shop_name, '')), ''), 'Unknown Shop');

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_offline_payment_proof_claims() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_offline_payment_proof_claims() TO service_role;

DROP TRIGGER IF EXISTS enforce_offline_payment_proof_claims ON public.offline_payment_proofs;
CREATE TRIGGER enforce_offline_payment_proof_claims
BEFORE INSERT OR UPDATE ON public.offline_payment_proofs
FOR EACH ROW
EXECUTE FUNCTION public.protect_offline_payment_proof_claims();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'offline_payment_proofs_status_check'
      AND conrelid = 'public.offline_payment_proofs'::regclass
  ) THEN
    ALTER TABLE public.offline_payment_proofs
      ADD CONSTRAINT offline_payment_proofs_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'offline_payment_proofs_kind_amount_check'
      AND conrelid = 'public.offline_payment_proofs'::regclass
  ) THEN
    ALTER TABLE public.offline_payment_proofs
      ADD CONSTRAINT offline_payment_proofs_kind_amount_check
      CHECK (
        (
          payment_kind = 'physical_verification'
          AND plan IS NULL
          AND amount = 5000
        )
        OR (
          payment_kind = 'service_fee'
          AND plan = '6_Months'
          AND amount = 6000
        )
        OR (
          payment_kind = 'service_fee'
          AND plan = '1_Year'
          AND amount = 10000
        )
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'offline_payment_proofs_receipt_path_check'
      AND conrelid = 'public.offline_payment_proofs'::regclass
  ) THEN
    ALTER TABLE public.offline_payment_proofs
      ADD CONSTRAINT offline_payment_proofs_receipt_path_check
      CHECK (
        receipt_path <> ''
        AND receipt_path NOT LIKE '/%'
        AND position('..' in receipt_path) = 0
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'physical_verification_payments_integrity_check'
      AND conrelid = 'public.physical_verification_payments'::regclass
  ) THEN
    ALTER TABLE public.physical_verification_payments
      ADD CONSTRAINT physical_verification_payments_integrity_check
      CHECK (
        status = 'success'
        AND amount IN (0, 5000)
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_fee_payments_plan_amount_check'
      AND conrelid = 'public.service_fee_payments'::regclass
  ) THEN
    ALTER TABLE public.service_fee_payments
      ADD CONSTRAINT service_fee_payments_plan_amount_check
      CHECK (
        status = 'success'
        AND (
          (plan = '6_Months' AND amount = 6000)
          OR (plan = '1_Year' AND amount = 10000)
        )
      )
      NOT VALID;
  END IF;
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
  v_shop record;
  v_existing_physical record;
  v_final_ref text;
  v_expected_amount numeric;
  v_plan_key text;
  v_base_date timestamp with time zone;
  v_new_end_date timestamp with time zone;
  v_shop_name text;
  v_plan_label text;
  v_end_date_label text;
BEGIN
  -- Kept for API compatibility; the authoritative end date is computed below.
  PERFORM p_new_end_date;

  IF NOT EXISTS (
    SELECT 1
    FROM public.staff_profiles sp
    JOIN public.admins a ON a.id = sp.id
    WHERE sp.id = p_staff_id
      AND a.role = 'super_admin'::public.admin_role
  ) THEN
    RAISE EXCEPTION 'Super admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_proof
  FROM public.offline_payment_proofs
  WHERE id = p_proof_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment proof not found.';
  END IF;

  SELECT
    s.id,
    s.owner_id,
    s.name,
    s.status,
    s.is_verified,
    s.kyc_status,
    s.subscription_end_date
  INTO v_shop
  FROM public.shops s
  WHERE s.id = v_proof.shop_id
    AND s.owner_id = v_proof.merchant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment proof does not match an owned shop.';
  END IF;

  v_shop_name := coalesce(nullif(trim(p_shop_name), ''), nullif(trim(v_shop.name), ''), 'your shop');

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
    v_final_ref := coalesce(nullif(trim(p_payment_ref), ''), 'OFFLINE_' || p_proof_id::text);

    IF v_proof.payment_kind = 'physical_verification' THEN
      IF v_shop.status IS DISTINCT FROM 'approved'::public.application_status THEN
        RAISE EXCEPTION 'Shop must be digitally approved before physical verification payment can be approved.';
      END IF;

      v_expected_amount := 5000;
      IF v_proof.plan IS NOT NULL OR v_proof.amount::numeric IS DISTINCT FROM v_expected_amount THEN
        RAISE EXCEPTION 'Invalid physical verification payment proof amount.';
      END IF;

      IF p_amount IS NOT NULL AND p_amount IS DISTINCT FROM v_expected_amount THEN
        RAISE EXCEPTION 'Physical verification approval amount mismatch.';
      END IF;

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
          v_proof.merchant_id, p_merchant_name, v_shop_name, p_city_name, v_expected_amount, v_final_ref, 'success'
        );
      ELSE
        v_final_ref := coalesce(nullif(trim(coalesce(v_existing_physical.payment_ref, '')), ''), v_final_ref);
      END IF;

    ELSIF v_proof.payment_kind = 'service_fee' THEN
      IF NOT (coalesce(v_shop.is_verified, false) OR v_shop.kyc_status = 'approved') THEN
        RAISE EXCEPTION 'Shop must be physically verified before service fee payment can be approved.';
      END IF;

      v_plan_key := v_proof.plan;
      v_expected_amount := CASE v_plan_key
        WHEN '6_Months' THEN 6000
        WHEN '1_Year' THEN 10000
        ELSE NULL
      END;

      IF v_expected_amount IS NULL THEN
        RAISE EXCEPTION 'Invalid service fee plan.';
      END IF;

      IF p_plan_key IS NOT NULL AND p_plan_key IS DISTINCT FROM v_plan_key THEN
        RAISE EXCEPTION 'Service fee approval plan mismatch.';
      END IF;

      IF v_proof.amount::numeric IS DISTINCT FROM v_expected_amount THEN
        RAISE EXCEPTION 'Invalid service fee payment proof amount.';
      END IF;

      IF p_amount IS NOT NULL AND p_amount IS DISTINCT FROM v_expected_amount THEN
        RAISE EXCEPTION 'Service fee approval amount mismatch.';
      END IF;

      v_base_date := now();
      IF v_shop.subscription_end_date IS NOT NULL AND v_shop.subscription_end_date > v_base_date THEN
        v_base_date := v_shop.subscription_end_date;
      END IF;

      v_new_end_date := CASE v_plan_key
        WHEN '6_Months' THEN v_base_date + interval '6 months'
        WHEN '1_Year' THEN v_base_date + interval '1 year'
      END;

      UPDATE public.shops
      SET subscription_plan = v_plan_key,
          subscription_end_date = v_new_end_date
      WHERE id = v_proof.shop_id AND owner_id = v_proof.merchant_id;

      INSERT INTO public.service_fee_payments (
        merchant_id, shop_id, amount, plan, payment_ref, status
      ) VALUES (
        v_proof.merchant_id, v_proof.shop_id, v_expected_amount, v_plan_key, v_final_ref, 'success'
      );
    ELSE
      RAISE EXCEPTION 'Unknown payment kind: %', v_proof.payment_kind;
    END IF;

    v_plan_label := CASE coalesce(v_plan_key, p_plan_key)
      WHEN '6_Months' THEN '6-month service plan'
      WHEN '1_Year' THEN '1-year service plan'
      ELSE 'service plan'
    END;
    v_end_date_label := CASE
      WHEN v_new_end_date IS NOT NULL THEN to_char(v_new_end_date AT TIME ZONE 'Africa/Lagos', 'DD Mon YYYY')
      ELSE NULL
    END;

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
      'plan', v_plan_key,
      'subscriptionEndDate', v_new_end_date,
      'message', 'Payment proof approved successfully.'
    );
  END IF;

  RAISE EXCEPTION 'Invalid action parameter.';
END;
$$;

REVOKE ALL ON FUNCTION public.process_offline_payment_review(
  bigint,
  uuid,
  text,
  text,
  text,
  numeric,
  text,
  timestamp with time zone,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_offline_payment_review(
  bigint,
  uuid,
  text,
  text,
  text,
  numeric,
  text,
  timestamp with time zone,
  text,
  text,
  text
) TO service_role;

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
  v_shop record;
  v_shop_name text := coalesce(nullif(trim(p_shop_name), ''), 'your shop');
  v_promo_id uuid;
  v_existing_payment_merchant uuid;
  v_code_exists boolean := false;
BEGIN
  IF p_shop_id IS NOT NULL THEN
    SELECT
      s.id,
      s.owner_id,
      s.name,
      s.status,
      s.is_verified
    INTO v_shop
    FROM public.shops s
    WHERE s.id = p_shop_id;

    IF NOT FOUND OR v_shop.owner_id IS DISTINCT FROM p_merchant_id THEN
      RAISE EXCEPTION 'Shop not found or access denied.' USING ERRCODE = '42501';
    END IF;

    IF v_shop.is_verified IS TRUE THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'message', 'Your shop is already physically verified.'
      );
    END IF;

    IF v_shop.status IS DISTINCT FROM 'approved'::public.application_status THEN
      RAISE EXCEPTION 'Your shop must be digitally approved before promo verification can continue.';
    END IF;

    v_shop_name := coalesce(nullif(trim(p_shop_name), ''), nullif(trim(v_shop.name), ''), 'your shop');
  END IF;

  PERFORM 1
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
    v_shop_name,
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

REVOKE ALL ON FUNCTION public.redeem_verification_promo_code(
  uuid,
  text,
  bigint,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_verification_promo_code(
  uuid,
  text,
  bigint,
  text,
  text,
  text
) TO service_role;
