-- Constrain profile footprint repairs to the profile owner or trusted service
-- operations so staff/admin edits cannot accidentally stamp their own device
-- onto another user's missing signup footprint.

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
  v_auth_uid uuid := auth.uid();
  v_footprint_context text := coalesce(current_setting('app.profile_footprint_context', true), '');
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
    ELSIF TG_OP = 'UPDATE'
      AND (v_auth_uid = NEW.id OR v_footprint_context = 'on')
    THEN
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
  v_auth_uid uuid := auth.uid();
BEGIN
  IF p_target_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- User sessions may only stamp their own profile. Service-role calls do not
  -- carry auth.uid() and remain available for trusted backend flows.
  IF v_auth_uid IS NOT NULL AND v_auth_uid <> p_target_user_id THEN
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
