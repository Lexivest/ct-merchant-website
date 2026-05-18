-- SECURITY DECONSTRUCTION: Solving the "Complex"
-- Consolidates profiles, login_security_guards, and staff_profiles into one logic flow.

-- 1. Ensure the table is correctly indexed for ON CONFLICT
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'login_security_guards') THEN
        CREATE TABLE public.login_security_guards (
            email text PRIMARY KEY,
            user_id uuid,
            failed_attempts integer NOT NULL DEFAULT 0,
            suspended_at timestamp with time zone,
            suspension_reason text,
            updated_at timestamp with time zone DEFAULT now()
        );
    END IF;
END $$;

-- 2. The Security Oracle View
-- Merges all security layers into a single source of truth
CREATE OR REPLACE VIEW public.vw_security_master AS
SELECT 
    u.id as user_id,
    lower(u.email) as email,
    COALESCE(p.is_suspended, false) as is_manually_suspended,
    COALESCE(lsg.failed_attempts, 0) as failed_attempts,
    lsg.suspended_at as guard_suspended_at,
    -- Effective Block Status (The "Complex" Solver)
    (COALESCE(p.is_suspended, false) OR lsg.suspended_at IS NOT NULL) as is_blocked,
    -- Effective Reason
    CASE 
        WHEN p.is_suspended THEN 'ACCOUNT_MODERATED'
        WHEN lsg.suspended_at IS NOT NULL THEN 'BRUTE_FORCE_LOCK'
        ELSE 'ALLOWED'
    END as effective_status,
    EXISTS(SELECT 1 FROM public.staff_profiles sp WHERE sp.id = u.id) as is_staff
FROM auth.users u
JOIN public.profiles p ON u.id = p.id
LEFT JOIN public.login_security_guards lsg ON lower(u.email) = lsg.email;

-- 3. The Master Access RPC
-- The ONLY function the frontend should call for security status or failure registration
CREATE OR REPLACE FUNCTION public.ctm_security_check(p_email text, p_is_failure boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_normalized_email text := lower(trim(coalesce(p_email, '')));
    v_user_id uuid;
    v_failed_count integer;
    v_suspended_at timestamp with time zone;
    v_is_manual boolean;
BEGIN
    -- Resolve User
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_normalized_email LIMIT 1;
    
    -- If failure occurred and user exists, update the guard
    IF p_is_failure AND v_user_id IS NOT NULL THEN
        INSERT INTO public.login_security_guards (email, user_id, failed_attempts, updated_at)
        VALUES (v_normalized_email, v_user_id, 1, now())
        ON CONFLICT (email) DO UPDATE SET
            failed_attempts = CASE 
                WHEN login_security_guards.suspended_at IS NOT NULL THEN GREATEST(login_security_guards.failed_attempts, 3)
                ELSE LEAST(login_security_guards.failed_attempts + 1, 3)
            END,
            suspended_at = CASE 
                WHEN login_security_guards.suspended_at IS NOT NULL THEN login_security_guards.suspended_at
                WHEN login_security_guards.failed_attempts + 1 >= 3 THEN now()
                ELSE NULL
            END,
            suspension_reason = 'too_many_wrong_password_attempts',
            updated_at = now();
    END IF;

    -- Fetch Final Effective Status
    SELECT 
        is_blocked, 
        effective_status, 
        failed_attempts, 
        guard_suspended_at 
    INTO v_is_manual, v_failed_count, v_failed_count, v_suspended_at
    FROM public.vw_security_master 
    WHERE email = v_normalized_email;

    -- If no record (user doesn't exist yet or profile missing), return safe default
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'NOT_FOUND', 'is_blocked', false, 'attempts_remaining', 3);
    END IF;

    RETURN jsonb_build_object(
        'status', (SELECT effective_status FROM public.vw_security_master WHERE email = v_normalized_email),
        'is_blocked', (SELECT is_blocked FROM public.vw_security_master WHERE email = v_normalized_email),
        'failed_attempts', (SELECT failed_attempts FROM public.vw_security_master WHERE email = v_normalized_email),
        'attempts_remaining', GREATEST(0, 3 - (SELECT failed_attempts FROM public.vw_security_master WHERE email = v_normalized_email)),
        'is_staff', (SELECT is_staff FROM public.vw_security_master WHERE email = v_normalized_email)
    );
END;
$$;

GRANT SELECT ON public.vw_security_master TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_security_check(text, boolean) TO anon, authenticated;
