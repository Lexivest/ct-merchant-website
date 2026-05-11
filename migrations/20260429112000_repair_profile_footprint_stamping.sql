-- Repair profile signup footprint stamping.
--
-- The admin-column guard correctly prevents clients from writing security
-- fields, but it also blocked the trusted footprint RPC from replacing
-- placeholder values such as "Unknown IP" and "Unknown Device".

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
  v_footprint_context text := coalesce(current_setting('app.profile_footprint_context', true), '');
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

      -- A later trigger stamps these fields from request metadata. Never
      -- trust values supplied directly by the client insert payload.
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

  IF v_footprint_context = 'on' THEN
    -- The trusted footprint RPC may fill missing placeholder values, but it
    -- must not overwrite an already captured real signup footprint.
    NEW.creation_ip := CASE
      WHEN OLD.creation_ip IS NULL
        OR OLD.creation_ip = 'Unknown IP'
        OR length(trim(OLD.creation_ip)) < 7
      THEN coalesce(nullif(trim(NEW.creation_ip), ''), OLD.creation_ip)
      ELSE OLD.creation_ip
    END;

    NEW.creation_device := CASE
      WHEN OLD.creation_device IS NULL
        OR OLD.creation_device = 'Unknown Device'
        OR length(trim(OLD.creation_device)) < 5
      THEN coalesce(nullif(trim(NEW.creation_device), ''), OLD.creation_device)
      ELSE OLD.creation_device
    END;

    NEW.ip_country := CASE
      WHEN OLD.ip_country IS NULL
        OR OLD.ip_country = 'Unknown'
        OR length(trim(OLD.ip_country)) < 2
      THEN coalesce(nullif(trim(NEW.ip_country), ''), OLD.ip_country)
      ELSE OLD.ip_country
    END;
  ELSE
    NEW.creation_ip := OLD.creation_ip;
    NEW.creation_device := OLD.creation_device;

    -- The network trigger may refresh ip_country after this function runs.
    IF OLD.ip_country IS NOT NULL
      AND OLD.ip_country <> 'Unknown'
      AND length(OLD.ip_country) >= 2
    THEN
      NEW.ip_country := OLD.ip_country;
    END IF;
  END IF;

  IF v_admin_role IS NULL THEN
    NEW.is_suspended := OLD.is_suspended;
    NEW.ai_chat_count := OLD.ai_chat_count;
    NEW.ai_last_chat_date := OLD.ai_last_chat_date;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_admin_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_admin_columns() TO service_role;

CREATE OR REPLACE FUNCTION public.handle_profile_network_info()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_net json;
  v_headers json;
  v_user_agent text;
  v_next_ip text;
  v_next_country text;
  v_next_device text;
BEGIN
  -- Absolute safety: footprint stamping should never block profile writes.
  BEGIN
    v_net := public.get_network_info();

    BEGIN
      v_headers := current_setting('request.headers', true)::json;
      SELECT value
      INTO v_user_agent
      FROM json_each_text(v_headers)
      WHERE lower(key) = 'user-agent'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_user_agent := NULL;
    END;

    v_next_ip := nullif(trim(coalesce(v_net->>'ip', '')), '');
    IF v_next_ip = 'Unknown IP' THEN
      v_next_ip := NULL;
    END IF;

    v_next_country := nullif(trim(coalesce(v_net->>'country', '')), '');
    IF v_next_country = 'Unknown' THEN
      v_next_country := NULL;
    END IF;

    v_next_device := nullif(trim(coalesce(v_user_agent, '')), '');
    IF v_next_device = 'Unknown Device' THEN
      v_next_device := NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.creation_ip := coalesce(v_next_ip, 'Unknown IP');
      NEW.ip_country := coalesce(v_next_country, 'Unknown');
      NEW.creation_device := coalesce(v_next_device, 'Unknown Device');
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.creation_ip IS NULL
        OR NEW.creation_ip = 'Unknown IP'
        OR length(trim(NEW.creation_ip)) < 7
      THEN
        NEW.creation_ip := coalesce(v_next_ip, NEW.creation_ip, 'Unknown IP');
      END IF;

      IF NEW.ip_country IS NULL
        OR NEW.ip_country = 'Unknown'
        OR length(trim(NEW.ip_country)) < 2
      THEN
        NEW.ip_country := coalesce(v_next_country, NEW.ip_country, 'Unknown');
      END IF;

      IF NEW.creation_device IS NULL
        OR NEW.creation_device = 'Unknown Device'
        OR length(trim(NEW.creation_device)) < 5
      THEN
        NEW.creation_device := coalesce(v_next_device, NEW.creation_device, 'Unknown Device');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF TG_OP = 'INSERT' THEN
      NEW.creation_ip := coalesce(NEW.creation_ip, 'Unknown IP');
      NEW.ip_country := coalesce(NEW.ip_country, 'Unknown');
      NEW.creation_device := coalesce(NEW.creation_device, 'Unknown Device');
    END IF;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_profile_network_info() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_profile_network_info() TO service_role;

CREATE OR REPLACE FUNCTION private.stamp_profile_footprint(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_headers json;
  v_net json;
  v_user_agent text;
BEGIN
  IF p_target_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF (SELECT auth.uid()) IS NOT NULL
     AND (SELECT auth.uid()) <> p_target_user_id
     AND NOT private.ctm_has_staff_access()
  THEN
    RETURN false;
  END IF;

  BEGIN
    v_net := public.get_network_info();
  EXCEPTION WHEN OTHERS THEN
    v_net := '{}'::json;
  END;

  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    SELECT value
    INTO v_user_agent
    FROM json_each_text(v_headers)
    WHERE lower(key) = 'user-agent'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_user_agent := NULL;
  END;

  PERFORM set_config('app.profile_footprint_context', 'on', true);

  UPDATE public.profiles
  SET
    creation_ip = CASE
      WHEN creation_ip IS NULL OR creation_ip = 'Unknown IP' OR length(trim(creation_ip)) < 7
        THEN nullif(v_net->>'ip', '')
      ELSE creation_ip
    END,
    ip_country = CASE
      WHEN ip_country IS NULL OR ip_country = 'Unknown'
        THEN nullif(v_net->>'country', '')
      ELSE ip_country
    END,
    creation_device = CASE
      WHEN creation_device IS NULL OR creation_device = 'Unknown Device'
        THEN coalesce(nullif(v_user_agent, ''), creation_device)
      ELSE creation_device
    END
  WHERE id = p_target_user_id;

  RETURN found;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.stamp_profile_footprint(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.stamp_profile_footprint(uuid) TO authenticated, service_role;
