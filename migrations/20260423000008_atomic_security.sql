-- ATOMIC SECURITY CONTROLLER
-- Replaces the complex spaghetti with a single source of truth.

-- 1. Create the Unified Status Function
CREATE OR REPLACE FUNCTION public.check_user_login_access(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_record record;
BEGIN
    -- This join collapses the entire complex into one row
    SELECT 
        u.id,
        (COALESCE(p.is_suspended, false) OR COALESCE(lsg.suspended_at IS NOT NULL, false)) as is_blocked,
        COALESCE(lsg.failed_attempts, 0) as failed_attempts,
        GREATEST(0, 3 - COALESCE(lsg.failed_attempts, 0)) as attempts_remaining,
        CASE 
            WHEN p.is_suspended THEN 'manual_admin_suspension'
            WHEN lsg.suspended_at IS NOT NULL THEN 'brute_force_lock'
            ELSE 'clear'
        END as status_code
    INTO v_record
    FROM auth.users u
    JOIN public.profiles p ON u.id = p.id
    LEFT JOIN public.login_security_guards lsg ON lsg.email = lower(u.email)
    WHERE lower(u.email) = lower(trim(p_email))
    LIMIT 1;

    -- Handle user not found safely
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'allowed', true,
            'status', 'not_found',
            'attempts_remaining', 3
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', NOT v_record.is_blocked,
        'status', v_record.status_code,
        'attempts_remaining', v_record.attempts_remaining,
        'user_id', v_record.id
    );
END;
$$;

-- 2. Create the Atomic "Fail" function
CREATE OR REPLACE FUNCTION public.register_failed_login(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_user_id uuid;
    v_failed_count integer;
    v_suspended_at timestamp with time zone;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(trim(p_email));
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'unknown_user', 'attempts_remaining', 3);
    END IF;

    -- Upsert the guard record
    INSERT INTO public.login_security_guards (email, user_id, failed_attempts, last_failed_at, updated_at)
    VALUES (lower(trim(p_email)), v_user_id, 1, now(), now())
    ON CONFLICT (email) DO UPDATE SET
        failed_attempts = CASE 
            WHEN login_security_guards.suspended_at IS NOT NULL THEN 3 
            ELSE LEAST(login_security_guards.failed_attempts + 1, 3) 
        END,
        suspended_at = CASE 
            WHEN login_security_guards.suspended_at IS NOT NULL THEN login_security_guards.suspended_at
            WHEN login_security_guards.failed_attempts + 1 >= 3 THEN now()
            ELSE NULL 
        END,
        suspension_reason = 'too_many_wrong_password_attempts',
        updated_at = now()
    RETURNING failed_attempts, suspended_at INTO v_failed_count, v_suspended_at;

    RETURN jsonb_build_object(
        'is_blocked', v_suspended_at IS NOT NULL,
        'attempts_remaining', GREATEST(0, 3 - v_failed_count)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_user_login_access(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_failed_login(text) TO anon, authenticated;
