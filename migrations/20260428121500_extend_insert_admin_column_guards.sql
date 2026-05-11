-- Extend admin-column guards to insert paths.
--
-- RLS controls which rows a user can insert/update. These triggers control
-- which system/admin fields can survive those writes.

CREATE OR REPLACE FUNCTION public.protect_profile_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_admin_role text := public.get_admin_role()::text;
  v_request_role text := auth.role();
  v_auth_uid uuid := auth.uid();
BEGIN
  -- Trusted server-side flows may intentionally write system fields.
  IF v_request_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_admin_role IS NULL THEN
      IF v_auth_uid IS NOT NULL THEN
        NEW.id := v_auth_uid;
      END IF;

      NEW.created_at := timezone('utc'::text, now());
      NEW.is_suspended := false;
      NEW.ai_chat_count := 0;
      NEW.ai_last_chat_date := CURRENT_DATE;

      -- The network-info trigger runs after this trigger and stamps these
      -- fields from request metadata. Do not trust client-supplied values.
      NEW.creation_ip := NULL;
      NEW.ip_country := NULL;
      NEW.creation_device := NULL;
    END IF;

    RETURN NEW;
  END IF;

  -- Immutable/system fields should not be editable from client sessions,
  -- even by an admin operating through the app.
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  NEW.creation_ip := OLD.creation_ip;
  NEW.creation_device := OLD.creation_device;

  -- The network trigger may refresh ip_country after this function runs.
  IF OLD.ip_country IS NOT NULL
    AND OLD.ip_country <> 'Unknown'
    AND length(OLD.ip_country) >= 2
  THEN
    NEW.ip_country := OLD.ip_country;
  END IF;

  IF v_admin_role IS NULL THEN
    NEW.is_suspended := OLD.is_suspended;
    NEW.ai_chat_count := OLD.ai_chat_count;
    NEW.ai_last_chat_date := OLD.ai_last_chat_date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_admin_columns ON public.profiles;
CREATE TRIGGER enforce_profile_admin_columns
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_admin_columns();

REVOKE ALL ON FUNCTION public.protect_profile_admin_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_admin_columns() TO service_role;

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
      NEW.id_issued := false;

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
    NEW.id_issued := OLD.id_issued;

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
