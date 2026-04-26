-- Remove legacy security views that exposed auth.users through public schema.
-- Keep the security logic inside SECURITY DEFINER RPCs instead.

CREATE OR REPLACE FUNCTION public.ctm_security_heartbeat(
    p_email text,
    p_action text DEFAULT 'CHECK'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_user_id uuid;
    v_result jsonb;
    v_normalized_email text := lower(trim(coalesce(p_email, '')));
BEGIN
    IF v_normalized_email = '' THEN
        RETURN jsonb_build_object(
            'status', 'CLEAR',
            'is_blocked', false,
            'remaining', 3,
            'is_staff', false,
            'user_id', null
        );
    END IF;

    SELECT id
    INTO v_user_id
    FROM auth.users
    WHERE lower(email) = v_normalized_email
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        IF p_action = 'FAILURE' THEN
            INSERT INTO public.login_security_guards (email, user_id, failed_attempts, updated_at)
            VALUES (v_normalized_email, v_user_id, 1, now())
            ON CONFLICT (email) DO UPDATE SET
                failed_attempts = LEAST(public.login_security_guards.failed_attempts + 1, 3),
                suspended_at = CASE
                    WHEN public.login_security_guards.failed_attempts + 1 >= 3 THEN now()
                    ELSE public.login_security_guards.suspended_at
                END,
                suspension_reason = 'too_many_wrong_password_attempts',
                updated_at = now();
        ELSIF p_action = 'SUCCESS' THEN
            UPDATE public.login_security_guards
            SET failed_attempts = 0,
                suspended_at = NULL,
                suspension_reason = NULL,
                updated_at = now()
            WHERE email = v_normalized_email;
        END IF;
    END IF;

    SELECT jsonb_build_object(
        'status',
        CASE
            WHEN COALESCE(p.is_suspended, false) THEN 'SUSPENDED'
            WHEN lsg.suspended_at IS NOT NULL THEN 'BRUTE_FORCE_LOCK'
            ELSE 'CLEAR'
        END,
        'is_blocked', (COALESCE(p.is_suspended, false) OR lsg.suspended_at IS NOT NULL),
        'remaining', GREATEST(0, 3 - COALESCE(lsg.failed_attempts, 0)),
        'is_staff', (sp.id IS NOT NULL),
        'user_id', u.id
    )
    INTO v_result
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.login_security_guards lsg ON lsg.email = lower(u.email)
    LEFT JOIN public.staff_profiles sp ON sp.id = u.id
    WHERE lower(u.email) = v_normalized_email
    LIMIT 1;

    IF v_result IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'CLEAR',
            'is_blocked', false,
            'remaining', 3,
            'is_staff', false,
            'user_id', v_user_id
        );
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ctm_security_heartbeat(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ctm_security_check(
    p_email text,
    p_is_failure boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_payload jsonb;
BEGIN
    SELECT public.ctm_security_heartbeat(
        p_email,
        CASE WHEN p_is_failure THEN 'FAILURE' ELSE 'CHECK' END
    )
    INTO v_payload;

    RETURN jsonb_build_object(
        'status', COALESCE(v_payload->>'status', 'CLEAR'),
        'is_blocked', COALESCE((v_payload->>'is_blocked')::boolean, false),
        'failed_attempts', GREATEST(0, 3 - COALESCE((v_payload->>'remaining')::integer, 3)),
        'attempts_remaining', COALESCE((v_payload->>'remaining')::integer, 3),
        'is_staff', COALESCE((v_payload->>'is_staff')::boolean, false)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ctm_security_check(text, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_user_security_status(
    p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_payload jsonb;
BEGIN
    SELECT public.ctm_security_heartbeat(p_email, 'CHECK')
    INTO v_payload;

    RETURN jsonb_build_object(
        'status', COALESCE(v_payload->>'status', 'CLEAR'),
        'is_blocked', COALESCE((v_payload->>'is_blocked')::boolean, false),
        'failed_attempts', GREATEST(0, 3 - COALESCE((v_payload->>'remaining')::integer, 3)),
        'remaining_attempts', COALESCE((v_payload->>'remaining')::integer, 3),
        'user_id', NULLIF(v_payload->>'user_id', '')::uuid
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_security_status(text) TO anon, authenticated;

REVOKE ALL ON TABLE public.vw_security_master FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.vw_security_status FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.vw_security_heartbeat FROM anon, authenticated, service_role;

DROP VIEW IF EXISTS public.vw_security_master;
DROP VIEW IF EXISTS public.vw_security_status;
DROP VIEW IF EXISTS public.vw_security_heartbeat;
