-- Require offline payment proofs to reference an actual uploaded receipt object.

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

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'payment-receipts'
      AND o.name = NEW.receipt_path
  ) THEN
    RAISE EXCEPTION 'Payment receipt file not found.';
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
