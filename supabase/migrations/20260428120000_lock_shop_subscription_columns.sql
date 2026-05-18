-- Lock payment-controlled shop subscription fields.
--
-- Merchants can update their own shop rows under RLS, so sensitive columns must
-- be guarded by a trigger. Service-role Edge Functions remain trusted for
-- payment workflows; authenticated users need a super_admin operation role.

CREATE OR REPLACE FUNCTION public.protect_shop_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_admin_role text := public.get_admin_role()::text;
  v_request_role text := auth.role();
BEGIN
  -- Payment Edge Functions use the service role after authenticating and
  -- authorizing the staff user themselves.
  IF v_request_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_admin_role IS NULL THEN
      NEW.status := 'pending';
      NEW.is_verified := false;
      NEW.is_featured := false;
      NEW.rejection_reason := NULL;
      NEW.is_open := true;
      NEW.unique_id := NULL;
      NEW.subscription_plan := NULL;
      NEW.subscription_end_date := NULL;

      IF NEW.kyc_status IN ('approved', 'rejected') THEN
        NEW.kyc_status := 'unsubmitted';
      END IF;
    END IF;

    IF v_admin_role IS DISTINCT FROM 'super_admin' THEN
      NEW.is_verified := false;
      NEW.subscription_plan := NULL;
      NEW.subscription_end_date := NULL;

      IF NEW.kyc_status IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Unauthorized: only super admins can review shop KYC.';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF v_admin_role IS NULL THEN
    NEW.status := OLD.status;
    NEW.is_verified := OLD.is_verified;
    NEW.is_featured := OLD.is_featured;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.is_open := OLD.is_open;
    NEW.unique_id := OLD.unique_id;
    NEW.subscription_plan := OLD.subscription_plan;
    NEW.subscription_end_date := OLD.subscription_end_date;

    IF NEW.kyc_status IN ('approved', 'rejected')
      AND OLD.kyc_status IS DISTINCT FROM NEW.kyc_status
    THEN
      RAISE EXCEPTION 'Unauthorized: merchants cannot approve or reject their own KYC.';
    END IF;
  END IF;

  IF v_admin_role IS DISTINCT FROM 'super_admin' THEN
    NEW.is_verified := OLD.is_verified;
    NEW.subscription_plan := OLD.subscription_plan;
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

DROP TRIGGER IF EXISTS enforce_shop_admin_columns ON public.shops;
CREATE TRIGGER enforce_shop_admin_columns
BEFORE INSERT OR UPDATE ON public.shops
FOR EACH ROW
EXECUTE FUNCTION public.protect_shop_admin_columns();

REVOKE ALL ON FUNCTION public.protect_shop_admin_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_shop_admin_columns() TO service_role;
