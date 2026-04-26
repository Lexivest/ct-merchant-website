ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS action_path text;

CREATE OR REPLACE FUNCTION public.push_user_notification(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_kind text DEFAULT 'system',
  p_action_path text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_notification_id bigint;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Notification user is required.';
  END IF;

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    kind,
    action_path
  )
  VALUES (
    p_user_id,
    left(coalesce(nullif(trim(p_title), ''), 'CTMerchant Update'), 120),
    left(coalesce(nullif(trim(p_message), ''), 'There is a new update on your account.'), 1000),
    lower(coalesce(nullif(trim(p_kind), ''), 'system')),
    nullif(trim(coalesce(p_action_path, '')), '')
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_shop_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shop_name text := coalesce(nullif(trim(NEW.name), ''), 'your shop');
  v_reason text := nullif(trim(coalesce(NEW.rejection_reason, '')), '');
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.push_user_notification(
        NEW.owner_id,
        'Shop Application Approved',
        '"' || v_shop_name || '" has passed digital approval. You can now open your merchant dashboard, add products, update your shop banner, and continue with physical verification.',
        'shop_approved',
        '/vendor-panel'
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.push_user_notification(
        NEW.owner_id,
        'Shop Application Needs Attention',
        'We could not approve "' || v_shop_name || '" yet.'
        || CASE
            WHEN v_reason IS NOT NULL THEN ' Reason: ' || v_reason || '.'
            ELSE ''
           END
        || ' Please review your details, correct the required documents, and submit again.',
        'shop_rejected',
        '/shop-registration?id=' || NEW.id::text
      );
    END IF;
  END IF;

  IF OLD.kyc_status IS DISTINCT FROM NEW.kyc_status THEN
    IF NEW.kyc_status = 'approved' THEN
      PERFORM public.push_user_notification(
        NEW.owner_id,
        'Video KYC Approved',
        '"' || v_shop_name || '" has passed physical verification. Your verified tools are now unlocked and your free trial is active.',
        'kyc_approved',
        '/vendor-panel'
      );
    ELSIF NEW.kyc_status = 'rejected' THEN
      PERFORM public.push_user_notification(
        NEW.owner_id,
        'Video KYC Needs Attention',
        'Your video KYC for "' || v_shop_name || '" was not approved.'
        || CASE
            WHEN v_reason IS NOT NULL THEN ' Reason: ' || v_reason || '.'
            ELSE ''
           END
        || ' Please record a clearer video inside your shop and submit again.',
        'kyc_rejected',
        '/merchant-video-kyc?shop_id=' || NEW.id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_shop_status_change_notification ON public.shops;
DROP TRIGGER IF EXISTS tr_notify_shop_status_change ON public.shops;

CREATE TRIGGER tr_notify_shop_status_change
AFTER UPDATE OF status, rejection_reason, kyc_status, is_verified
ON public.shops
FOR EACH ROW
EXECUTE FUNCTION public.notify_shop_status_change();

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
      ORDER BY id DESC LIMIT 1;

      IF NOT FOUND THEN
        INSERT INTO public.physical_verification_payments (
          merchant_id, merchant_name, shop_name, city, amount, payment_ref, status
        ) VALUES (
          v_proof.merchant_id, p_merchant_name, p_shop_name, p_city_name, p_amount, v_final_ref, 'success'
        );
      ELSE
        v_final_ref := v_existing_physical.payment_ref;
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
  v_payment_ref text;
  v_shop_name text := coalesce(nullif(trim(p_shop_name), ''), 'your shop');
BEGIN
  v_payment_ref := 'PROMO_' || p_code;

  IF EXISTS (
    SELECT 1
    FROM public.physical_verification_payments
    WHERE payment_ref = v_payment_ref
  ) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'message', 'Promo code already verified.');
  END IF;

  PERFORM 1
  FROM public.promo_codes
  WHERE code = p_code
    AND is_used = false
  FOR UPDATE;

  IF NOT found THEN
    RAISE EXCEPTION 'Invalid or already used promo code.';
  END IF;

  UPDATE public.promo_codes
  SET
    is_used = true,
    used_by = p_merchant_id,
    used_at = now()
  WHERE code = p_code;

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

UPDATE public.notifications
SET kind = CASE
  WHEN title ILIKE '%shop application approved%' THEN 'shop_approved'
  WHEN title ILIKE '%shop application needs attention%' THEN 'shop_rejected'
  WHEN title ILIKE '%video kyc approved%' OR title ILIKE '%shop verified%' THEN 'kyc_approved'
  WHEN title ILIKE '%video kyc needs attention%' THEN 'kyc_rejected'
  WHEN title ILIKE '%verification fee confirmed%' THEN 'verification_payment_confirmed'
  WHEN title ILIKE '%verification receipt needs attention%' THEN 'verification_payment_rejected'
  WHEN title ILIKE '%service fee confirmed%' THEN 'service_fee_confirmed'
  WHEN title ILIKE '%service fee receipt needs attention%' THEN 'service_fee_rejected'
  ELSE kind
END,
action_path = CASE
  WHEN action_path IS NOT NULL THEN action_path
  WHEN title ILIKE '%shop application approved%' THEN '/vendor-panel'
  WHEN title ILIKE '%shop application needs attention%' THEN '/vendor-panel'
  WHEN title ILIKE '%video kyc approved%' OR title ILIKE '%shop verified%' THEN '/vendor-panel'
  WHEN title ILIKE '%video kyc needs attention%' THEN '/vendor-panel'
  WHEN title ILIKE '%verification fee confirmed%' THEN '/vendor-panel'
  WHEN title ILIKE '%verification receipt needs attention%' THEN '/vendor-panel'
  WHEN title ILIKE '%service fee confirmed%' THEN '/vendor-panel'
  WHEN title ILIKE '%service fee receipt needs attention%' THEN '/vendor-panel'
  ELSE action_path
END
WHERE coalesce(kind, 'system') = 'system' OR action_path IS NULL;
