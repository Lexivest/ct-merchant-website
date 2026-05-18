-- ============================================================
-- Fix 1: Wrong notification action path in process_offline_payment_review
--         Physical-verification rejections were pointing to /remita
--         (Remita online payment) instead of /merchant-payment.
--
-- Fix 2: Subscription end date is now computed atomically inside
--         this RPC using the freshly FOR-UPDATE-locked shop row and
--         p_payment_effective_at, so the edge function no longer needs
--         to pre-compute and pass p_new_end_date.
--         p_new_end_date is kept as a parameter for backward compatibility
--         but is now ignored when p_payment_effective_at is supplied.
--
-- Fix 3: New atomic record_manual_payment() RPC replaces the non-atomic
--         multi-step logic in the staff-manual-payment-review edge function.
-- ============================================================

-- ── Fix 1 + 2: process_offline_payment_review ───────────────────────────────

DROP FUNCTION IF EXISTS public.process_offline_payment_review(
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
  text,
  timestamp with time zone
);

CREATE OR REPLACE FUNCTION public.process_offline_payment_review(
  p_proof_id              bigint,
  p_staff_id              uuid,
  p_action                text,
  p_note                  text,
  p_payment_ref           text                        DEFAULT NULL,
  p_amount                numeric                     DEFAULT NULL,
  p_plan_key              text                        DEFAULT NULL,
  p_new_end_date          timestamp with time zone    DEFAULT NULL,  -- kept for compat, ignored when p_payment_effective_at is set
  p_merchant_name         text                        DEFAULT NULL,
  p_shop_name             text                        DEFAULT NULL,
  p_city_name             text                        DEFAULT NULL,
  p_payment_effective_at  timestamp with time zone    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_proof              record;
  v_shop               record;
  v_existing_physical  record;
  v_final_ref          text;
  v_expected_amount    numeric;
  v_plan_key           text;
  v_base_date          timestamp with time zone;
  v_new_end_date       timestamp with time zone;
  v_payment_eff        timestamp with time zone;
  v_shop_name          text;
  v_city_name          text;
  v_plan_label         text;
  v_end_date_label     text;
BEGIN
  -- ── Authorization ───────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff_profiles sp
    JOIN public.admins a ON a.id = sp.id
    WHERE sp.id = p_staff_id
      AND a.role = 'super_admin'::public.admin_role
  ) THEN
    RAISE EXCEPTION 'Super admin access required.' USING ERRCODE = '42501';
  END IF;

  -- ── Lock proof row ──────────────────────────────────────────────────────
  SELECT * INTO v_proof
  FROM public.offline_payment_proofs
  WHERE id = p_proof_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment proof not found.';
  END IF;

  -- ── Lock shop row (separate from city to avoid FOR UPDATE on JOIN) ──────
  SELECT s.id,
         s.owner_id,
         s.name,
         s.status,
         s.is_verified,
         s.kyc_status,
         s.subscription_end_date,
         s.city_id
  INTO v_shop
  FROM public.shops s
  WHERE s.id = v_proof.shop_id
    AND s.owner_id = v_proof.merchant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment proof does not match an owned shop.';
  END IF;

  -- Resolve display names (caller-supplied → DB value → fallback)
  SELECT c.name INTO v_city_name
  FROM public.cities c
  WHERE c.id = v_shop.city_id;

  v_shop_name := coalesce(nullif(trim(p_shop_name), ''), nullif(trim(v_shop.name), ''), 'your shop');
  v_city_name := coalesce(nullif(trim(p_city_name), ''), nullif(trim(v_city_name), ''), 'Unknown City');

  -- ── Idempotency guard ───────────────────────────────────────────────────
  IF v_proof.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success',    true,
      'idempotent', true,
      'status',     v_proof.status,
      'message',    'Payment proof is already ' || v_proof.status
    );
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- REJECT path
  -- ════════════════════════════════════════════════════════════════════════
  IF p_action = 'reject' THEN
    IF p_note IS NULL OR trim(p_note) = '' THEN
      RAISE EXCEPTION 'A rejection note is required.';
    END IF;

    UPDATE public.offline_payment_proofs
    SET status      = 'rejected',
        review_note = p_note,
        reviewed_by = p_staff_id,
        reviewed_at = now()
    WHERE id = p_proof_id;

    IF v_proof.payment_kind = 'physical_verification' THEN
      -- Fixed: was /remita, corrected to /merchant-payment
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Verification Receipt Needs Attention',
        'We could not confirm your physical verification payment for "' || v_shop_name || '".'
          || CASE
               WHEN nullif(trim(coalesce(p_note, '')), '') IS NOT NULL
               THEN ' Staff note: ' || trim(p_note) || '.'
               ELSE ''
             END
          || ' Please upload a clearer receipt or contact support if the transfer has already reached us.',
        'verification_payment_rejected',
        '/merchant-payment?shop_id=' || v_proof.shop_id::text
      );

    ELSIF v_proof.payment_kind = 'service_fee' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Service Fee Receipt Needs Attention',
        'We could not confirm the service fee payment for "' || v_shop_name || '".'
          || CASE
               WHEN nullif(trim(coalesce(p_note, '')), '') IS NOT NULL
               THEN ' Staff note: ' || trim(p_note) || '.'
               ELSE ''
             END
          || ' Please upload a clearer receipt or contact support if payment has already been made.',
        'service_fee_rejected',
        '/service-fee?shop_id=' || v_proof.shop_id::text
      );
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'message', 'Payment proof rejected.');
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- APPROVE path
  -- ════════════════════════════════════════════════════════════════════════
  IF p_action = 'approve' THEN
    v_final_ref := coalesce(nullif(trim(p_payment_ref), ''), 'OFFLINE_' || p_proof_id::text);

    -- ── Physical verification ─────────────────────────────────────────────
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
          merchant_id, merchant_name, shop_name, city,
          amount, payment_ref, status, shop_id, city_id
        ) VALUES (
          v_proof.merchant_id, p_merchant_name, v_shop_name, v_city_name,
          v_expected_amount, v_final_ref, 'success', v_shop.id, v_shop.city_id
        );
      ELSE
        -- Idempotent re-approval: keep existing ref, backfill shop/city if missing.
        v_final_ref := coalesce(
          nullif(trim(coalesce(v_existing_physical.payment_ref, '')), ''),
          v_final_ref
        );
        UPDATE public.physical_verification_payments
        SET shop_id = coalesce(shop_id, v_shop.id),
            city_id = coalesce(city_id, v_shop.city_id),
            city    = coalesce(nullif(trim(coalesce(city, '')), ''), v_city_name)
        WHERE id = v_existing_physical.id;
      END IF;

    -- ── Service fee ───────────────────────────────────────────────────────
    ELSIF v_proof.payment_kind = 'service_fee' THEN
      IF NOT (coalesce(v_shop.is_verified, false) OR v_shop.kyc_status = 'approved') THEN
        RAISE EXCEPTION 'Shop must be physically verified before service fee payment can be approved.';
      END IF;

      v_plan_key := v_proof.plan;
      v_expected_amount := CASE v_plan_key
        WHEN '6_Months' THEN 6000
        WHEN '1_Year'   THEN 10000
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

      -- Compute end date atomically from the freshly-locked shop row.
      -- p_payment_effective_at takes priority; p_new_end_date is accepted for
      -- backward compat but only used when neither effective_at nor a valid
      -- base can be determined (very old callers).
      v_payment_eff := coalesce(p_payment_effective_at, now());

      v_base_date := v_payment_eff;
      IF v_shop.subscription_end_date IS NOT NULL
         AND v_shop.subscription_end_date > v_base_date THEN
        v_base_date := v_shop.subscription_end_date;
      END IF;

      v_new_end_date := CASE v_plan_key
        WHEN '6_Months' THEN v_base_date + interval '6 months'
        WHEN '1_Year'   THEN v_base_date + interval '1 year'
      END;

      UPDATE public.shops
      SET subscription_plan     = v_plan_key,
          subscription_end_date = v_new_end_date
      WHERE id = v_proof.shop_id AND owner_id = v_proof.merchant_id;

      INSERT INTO public.service_fee_payments (
        merchant_id, shop_id, amount, plan, payment_ref, status, created_at
      ) VALUES (
        v_proof.merchant_id, v_proof.shop_id,
        v_expected_amount, v_plan_key, v_final_ref, 'success', v_payment_eff
      );

    ELSE
      RAISE EXCEPTION 'Unknown payment kind: %', v_proof.payment_kind;
    END IF;

    -- ── Finalise proof status ─────────────────────────────────────────────
    v_plan_label := CASE coalesce(v_plan_key, p_plan_key)
      WHEN '6_Months' THEN '6-month service plan'
      WHEN '1_Year'   THEN '1-year service plan'
      ELSE 'service plan'
    END;
    v_end_date_label := CASE
      WHEN v_new_end_date IS NOT NULL
      THEN to_char(v_new_end_date AT TIME ZONE 'Africa/Lagos', 'DD Mon YYYY')
      ELSE NULL
    END;

    UPDATE public.offline_payment_proofs
    SET status             = 'approved',
        review_note        = coalesce(p_note, 'Payment confirmed by staff.'),
        reviewed_by        = p_staff_id,
        reviewed_at        = now(),
        approval_payment_ref = v_final_ref
    WHERE id = p_proof_id;

    IF v_proof.payment_kind = 'physical_verification' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Verification Fee Confirmed',
        'We have confirmed your physical verification payment for "' || v_shop_name
          || '". You can now continue to video KYC.',
        'verification_payment_confirmed',
        '/merchant-video-kyc?shop_id=' || v_proof.shop_id::text
      );
    ELSIF v_proof.payment_kind = 'service_fee' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Service Fee Confirmed',
        '"' || v_shop_name || '" is now on the ' || v_plan_label
          || CASE
               WHEN v_end_date_label IS NOT NULL
               THEN ' and remains active until ' || v_end_date_label || '.'
               ELSE '.'
             END,
        'service_fee_confirmed',
        '/vendor-panel'
      );
    END IF;

    RETURN jsonb_build_object(
      'success',             true,
      'status',              'approved',
      'paymentRef',          v_final_ref,
      'plan',                v_plan_key,
      'subscriptionEndDate', v_new_end_date,
      'paymentEffectiveAt',  v_payment_eff,
      'message',             'Payment proof approved successfully.'
    );
  END IF;

  RAISE EXCEPTION 'Invalid action parameter.';
END;
$$;

REVOKE ALL ON FUNCTION public.process_offline_payment_review(
  bigint, uuid, text, text, text, numeric, text,
  timestamp with time zone, text, text, text,
  timestamp with time zone
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_offline_payment_review(
  bigint, uuid, text, text, text, numeric, text,
  timestamp with time zone, text, text, text,
  timestamp with time zone
) TO service_role;


-- ── Fix 3: record_manual_payment — atomic RPC for staff manual payments ──────
--
-- Replaces the non-atomic multi-step logic that was embedded directly in the
-- staff-manual-payment-review edge function.  All DB work (shop update,
-- payment ledger insert, notification) runs in a single PL/pgSQL transaction
-- so a failure cannot leave the subscription activated without a ledger record.

CREATE OR REPLACE FUNCTION public.record_manual_payment(
  p_staff_id      uuid,
  p_shop_id       bigint,
  p_payment_kind  text,
  p_plan_key      text                      DEFAULT NULL,
  p_payment_ref   text                      DEFAULT NULL,
  p_effective_at  timestamp with time zone  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_shop               record;
  v_profile            record;
  v_existing_physical  record;
  v_payment_kind       text;
  v_plan_key           text;
  v_payment_ref        text;
  v_effective_at       timestamp with time zone;
  v_base_date          timestamp with time zone;
  v_new_end_date       timestamp with time zone;
  v_merchant_name      text;
  v_shop_name          text;
  v_city_name          text;
  v_plan_amount        integer;
  v_plan_months        integer;
  v_plan_label         text;
  v_expiry_label       text;
  v_idempotent         boolean := false;
BEGIN
  -- ── Authorization ───────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff_profiles sp
    JOIN public.admins a ON a.id = sp.id
    WHERE sp.id = p_staff_id
      AND a.role = 'super_admin'::public.admin_role
  ) THEN
    RAISE EXCEPTION 'Super admin access required.' USING ERRCODE = '42501';
  END IF;

  -- ── Normalize & validate inputs ─────────────────────────────────────────
  v_payment_kind := lower(trim(coalesce(p_payment_kind, '')));
  v_plan_key     := nullif(trim(coalesce(p_plan_key, '')), '');
  v_payment_ref  := nullif(
    trim(regexp_replace(coalesce(p_payment_ref, ''), '[^A-Z0-9/_\-]', '', 'gi')),
    ''
  );
  v_effective_at := coalesce(p_effective_at, now());

  IF v_payment_kind NOT IN ('physical_verification', 'service_fee') THEN
    RAISE EXCEPTION 'Invalid payment kind.';
  END IF;
  IF v_payment_kind = 'service_fee' AND v_plan_key IS NULL THEN
    RAISE EXCEPTION 'A valid subscription plan is required.';
  END IF;
  IF v_payment_kind = 'service_fee' AND v_plan_key NOT IN ('6_Months', '1_Year') THEN
    RAISE EXCEPTION 'Invalid subscription plan key.';
  END IF;
  IF v_effective_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Payment date cannot be in the future.';
  END IF;

  -- ── Load shop ───────────────────────────────────────────────────────────
  -- Lock the row for the service_fee path to prevent concurrent end-date races.
  IF v_payment_kind = 'service_fee' THEN
    SELECT s.id, s.owner_id, s.name, s.status, s.is_verified,
           s.kyc_status, s.subscription_end_date, s.city_id
    INTO v_shop
    FROM public.shops s
    WHERE s.id = p_shop_id
    FOR UPDATE;
  ELSE
    SELECT s.id, s.owner_id, s.name, s.status, s.is_verified,
           s.kyc_status, s.subscription_end_date, s.city_id
    INTO v_shop
    FROM public.shops s
    WHERE s.id = p_shop_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found.';
  END IF;

  -- ── Resolve display names ───────────────────────────────────────────────
  SELECT p.full_name, c.name AS city_name
  INTO v_profile
  FROM public.profiles p
  LEFT JOIN public.cities c ON c.id = p.city_id
  WHERE p.id = v_shop.owner_id;

  SELECT c.name INTO v_city_name
  FROM public.cities c
  WHERE c.id = v_shop.city_id;

  v_merchant_name := coalesce(nullif(trim(coalesce(v_profile.full_name, '')), ''), 'Merchant');
  v_shop_name     := coalesce(nullif(trim(coalesce(v_shop.name, '')), ''), 'Shop #' || p_shop_id::text);
  v_city_name     := coalesce(
    nullif(trim(coalesce(v_city_name, '')), ''),
    nullif(trim(coalesce(v_profile.city_name, '')), ''),
    'Unknown City'
  );

  -- ════════════════════════════════════════════════════════════════════════
  -- Physical verification path
  -- ════════════════════════════════════════════════════════════════════════
  IF v_payment_kind = 'physical_verification' THEN
    IF v_shop.status IS DISTINCT FROM 'approved'::public.application_status THEN
      RAISE EXCEPTION 'Shop must be digitally approved before physical verification payment can be recorded.';
    END IF;

    v_payment_ref := coalesce(
      v_payment_ref,
      'MANUALPHY_' || p_shop_id::text || '_' || extract(epoch from now())::bigint::text
    );

    -- Idempotency: if a successful payment already exists, just backfill any
    -- missing shop/city metadata and return without creating a duplicate.
    SELECT * INTO v_existing_physical
    FROM public.physical_verification_payments
    WHERE merchant_id = v_shop.owner_id AND status = 'success'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      v_idempotent  := true;
      v_payment_ref := coalesce(nullif(trim(coalesce(v_existing_physical.payment_ref, '')), ''), v_payment_ref);

      UPDATE public.physical_verification_payments
      SET shop_id = coalesce(shop_id, v_shop.id),
          city_id = coalesce(city_id, v_shop.city_id),
          city    = coalesce(nullif(trim(coalesce(city, '')), ''), v_city_name)
      WHERE id = v_existing_physical.id;
    ELSE
      INSERT INTO public.physical_verification_payments (
        merchant_id, merchant_name, shop_name, city,
        amount, payment_ref, status, shop_id, city_id
      ) VALUES (
        v_shop.owner_id, v_merchant_name, v_shop_name, v_city_name,
        5000, v_payment_ref, 'success', v_shop.id, v_shop.city_id
      );

      PERFORM public.push_user_notification(
        v_shop.owner_id,
        'Verification Fee Confirmed',
        'We have confirmed your physical verification payment for "'
          || v_shop_name || '". You can now continue to video KYC.',
        'verification_payment_confirmed',
        '/merchant-video-kyc?shop_id=' || v_shop.id::text
      );
    END IF;

    RETURN jsonb_build_object(
      'success',     true,
      'idempotent',  v_idempotent,
      'paymentKind', v_payment_kind,
      'paymentRef',  v_payment_ref,
      'amount',      5000,
      'message', CASE v_idempotent
        WHEN true THEN 'Physical verification payment was already recorded for this merchant.'
        ELSE 'Physical verification payment recorded successfully.'
      END
    );
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- Service fee path
  -- ════════════════════════════════════════════════════════════════════════
  IF v_shop.status IS DISTINCT FROM 'approved'::public.application_status THEN
    RAISE EXCEPTION 'Shop must be digitally approved before a service fee payment can be recorded.';
  END IF;
  IF NOT (coalesce(v_shop.is_verified, false) OR v_shop.kyc_status = 'approved') THEN
    RAISE EXCEPTION 'Shop must be physically verified before a service fee payment can be recorded.';
  END IF;

  v_plan_amount := CASE v_plan_key WHEN '6_Months' THEN 6000  WHEN '1_Year' THEN 10000 END;
  v_plan_months := CASE v_plan_key WHEN '6_Months' THEN 6     WHEN '1_Year' THEN 12    END;
  v_plan_label  := CASE v_plan_key WHEN '6_Months' THEN '6-month service plan'
                                   WHEN '1_Year'   THEN '1-year service plan'
                   END;

  -- Stack on any existing active subscription.
  v_base_date := v_effective_at;
  IF v_shop.subscription_end_date IS NOT NULL
     AND v_shop.subscription_end_date > v_base_date THEN
    v_base_date := v_shop.subscription_end_date;
  END IF;
  v_new_end_date := v_base_date + (v_plan_months || ' months')::interval;

  v_payment_ref := coalesce(
    v_payment_ref,
    'MANUALSUB_' || p_shop_id::text || '_' || extract(epoch from now())::bigint::text
  );

  -- Atomic: both writes happen in the same PL/pgSQL transaction.
  UPDATE public.shops
  SET subscription_plan     = v_plan_key,
      subscription_end_date = v_new_end_date
  WHERE id = v_shop.id AND owner_id = v_shop.owner_id;

  INSERT INTO public.service_fee_payments (
    merchant_id, shop_id, amount, plan, payment_ref, status, created_at
  ) VALUES (
    v_shop.owner_id, v_shop.id, v_plan_amount, v_plan_key,
    v_payment_ref, 'success', v_effective_at
  );

  v_expiry_label := to_char(v_new_end_date AT TIME ZONE 'Africa/Lagos', 'DD Mon YYYY');

  PERFORM public.push_user_notification(
    v_shop.owner_id,
    'Service Fee Confirmed',
    '"' || v_shop_name || '" is now on the ' || v_plan_label
      || ' and remains active until ' || v_expiry_label || '.',
    'service_fee_confirmed',
    '/vendor-panel'
  );

  RETURN jsonb_build_object(
    'success',             true,
    'paymentKind',         v_payment_kind,
    'paymentRef',          v_payment_ref,
    'amount',              v_plan_amount,
    'plan',                v_plan_key,
    'subscriptionEndDate', v_new_end_date,
    'paymentEffectiveAt',  v_effective_at,
    'message',             'Service fee payment recorded successfully.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_manual_payment(
  uuid, bigint, text, text, text, timestamp with time zone
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_manual_payment(
  uuid, bigint, text, text, text, timestamp with time zone
) TO service_role;
