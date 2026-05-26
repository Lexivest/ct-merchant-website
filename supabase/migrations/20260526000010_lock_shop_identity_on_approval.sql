-- Extend protect_shop_admin_columns() to cover name, phone, and whatsapp.
--
-- Context:
--   MerchantSettings.jsx shows a "Security Lockdown Active" banner and
--   disables the name, phone, and whatsapp inputs once a shop's status
--   is 'approved'. However, that lock was purely UI-side — nothing in the
--   database trigger prevented an authenticated merchant from bypassing the
--   disabled inputs and sending a direct API update to change those fields.
--
--   The staff dashboard (StaffShopIdentity) is the only legitimate path for
--   updating these fields on an approved shop. It calls the super-admin-only
--   RPC ctm_update_shop_locked_contact_fields which (a) records a reason
--   for the audit trail and (b) runs with the caller's super_admin JWT, so
--   get_admin_role() returns 'super_admin' and the new freeze block is
--   skipped — admins are unaffected.
--
-- Fix:
--   Inside the UPDATE / v_admin_role IS NULL block, freeze name, phone, and
--   whatsapp back to their stored values whenever the shop is already
--   approved. Updates to these fields from non-admin sessions are silently
--   reverted (consistent with how the rest of the shop guard behaves).

CREATE OR REPLACE FUNCTION public.protect_shop_admin_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_admin_role   text := public.get_admin_role()::text;
  v_request_role text := auth.role();
BEGIN
  -- Payment Edge Functions use the service role after authenticating and
  -- authorizing the staff user themselves.
  IF v_request_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_admin_role IS NULL THEN
      NEW.status               := 'pending';
      NEW.is_verified          := false;
      NEW.is_featured          := false;
      NEW.rejection_reason     := NULL;
      NEW.is_open              := true;
      NEW.unique_id            := NULL;
      NEW.subscription_plan    := NULL;
      NEW.subscription_end_date := NULL;
      NEW.id_issued            := false;

      IF NEW.kyc_status IN ('approved', 'rejected') THEN
        NEW.kyc_status := 'unsubmitted';
      END IF;
    END IF;

    IF v_admin_role IS DISTINCT FROM 'super_admin' THEN
      NEW.is_verified           := false;
      NEW.subscription_plan     := NULL;
      NEW.subscription_end_date := NULL;

      IF NEW.kyc_status IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Unauthorized: only super admins can review shop KYC.';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────────
  IF v_admin_role IS NULL THEN
    NEW.status                := OLD.status;
    NEW.is_verified           := OLD.is_verified;
    NEW.is_featured           := OLD.is_featured;
    NEW.rejection_reason      := OLD.rejection_reason;
    NEW.is_open               := OLD.is_open;
    NEW.unique_id             := OLD.unique_id;
    NEW.subscription_plan     := OLD.subscription_plan;
    NEW.subscription_end_date := OLD.subscription_end_date;
    NEW.id_issued             := OLD.id_issued;

    IF NEW.kyc_status IN ('approved', 'rejected')
      AND OLD.kyc_status IS DISTINCT FROM NEW.kyc_status
    THEN
      RAISE EXCEPTION 'Unauthorized: merchants cannot approve or reject their own KYC.';
    END IF;

    -- Once a shop is approved, name / phone / whatsapp are locked and can
    -- only be changed by staff via the ctm_update_shop_locked_contact_fields
    -- RPC (which runs with a super_admin JWT and therefore skips this block).
    IF OLD.status::text = 'approved' THEN
      NEW.name     := OLD.name;
      NEW.phone    := OLD.phone;
      NEW.whatsapp := OLD.whatsapp;
    END IF;
  END IF;

  IF v_admin_role IS DISTINCT FROM 'super_admin' THEN
    NEW.is_verified           := OLD.is_verified;
    NEW.subscription_plan     := OLD.subscription_plan;
    NEW.subscription_end_date := OLD.subscription_end_date;

    IF OLD.kyc_status IS DISTINCT FROM NEW.kyc_status
      AND NEW.kyc_status IN ('approved', 'rejected')
    THEN
      RAISE EXCEPTION 'Unauthorized: only super admins can review shop KYC.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
