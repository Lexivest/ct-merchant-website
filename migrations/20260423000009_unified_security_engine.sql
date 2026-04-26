-- THE COMPLEX DECODER: Unified Security Engine
-- This migration collapses all security checks into a single intelligence layer.

-- 1. Ensure a clean, indexed tracking table
CREATE TABLE IF NOT EXISTS public.login_security_guards (
    email text PRIMARY KEY,
    user_id uuid,
    failed_attempts integer NOT NULL DEFAULT 0,
    suspended_at timestamp with time zone,
    suspension_reason text,
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. THE MASTER INTELLIGENCE VIEW
-- Collapses Brute-force, Manual Bans, and Roles into one row.
CREATE OR REPLACE VIEW public.vw_security_heartbeat AS
SELECT 
    u.id as user_id,
    lower(u.email) as email,
    -- Effective Status Logic
    CASE 
        WHEN p.is_suspended THEN 'SUSPENDED'
        WHEN lsg.suspended_at IS NOT NULL THEN 'BRUTE_FORCE_LOCK'
        ELSE 'CLEAR'
    END as status,
    -- Combined Block Flag
    (COALESCE(p.is_suspended, false) OR lsg.suspended_at IS NOT NULL) as is_blocked,
    -- Failure tracking
    COALESCE(lsg.failed_attempts, 0) as failed_attempts,
    GREATEST(0, 3 - COALESCE(lsg.failed_attempts, 0)) as remaining_attempts,
    -- Role access
    (sp.id IS NOT NULL) as is_staff
FROM auth.users u
JOIN public.profiles p ON u.id = p.id
LEFT JOIN public.login_security_guards lsg ON lsg.email = lower(u.email)
LEFT JOIN public.staff_profiles sp ON u.id = sp.id;

-- 3. THE SECURITY HEARTBEAT RPC
-- The SINGLE entry point for the frontend.
CREATE OR REPLACE FUNCTION public.ctm_security_heartbeat(
    p_email text, 
    p_register_failure boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_user_id uuid;
    v_result jsonb;
BEGIN
    -- Resolve the User ID from the Email (The bridge between tables)
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(trim(p_email));
    
    -- Handle Failure Registration (Atomic Update)
    IF p_register_failure AND v_user_id IS NOT NULL THEN
        INSERT INTO public.login_security_guards (email, user_id, failed_attempts, updated_at)
        VALUES (lower(trim(p_email)), v_user_id, 1, now())
        ON CONFLICT (email) DO UPDATE SET
            failed_attempts = LEAST(login_security_guards.failed_attempts + 1, 3),
            suspended_at = CASE 
                WHEN login_security_guards.failed_attempts + 1 >= 3 THEN now() 
                ELSE login_security_guards.suspended_at 
            END,
            suspension_reason = 'too_many_wrong_password_attempts',
            updated_at = now();
    END IF;

    -- Return the complete Intelligence Row
    SELECT jsonb_build_object(
        'status', status,
        'is_blocked', is_blocked,
        'remaining', remaining_attempts,
        'is_staff', is_staff,
        'user_id', user_id
    ) INTO v_result
    FROM public.vw_security_heartbeat
    WHERE lower(email) = lower(trim(p_email));

    -- Safe fallback for unknown users
    IF v_result IS NULL THEN
        RETURN jsonb_build_object('status', 'CLEAR', 'is_blocked', false, 'remaining', 3, 'is_staff', false);
    END IF;

    RETURN v_result;
END;
$$;

GRANT SELECT ON public.vw_security_heartbeat TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_security_heartbeat(text, boolean) TO anon, authenticated;
