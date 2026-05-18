-- SECURITY CONVERGENCE: Final Single Source of Truth
-- This migration fixes the views to be more inclusive and upgrades the heartbeat RPC.

-- 1. Upgrade the Master Intelligence View
-- Use LEFT JOIN on profiles to ensure we catch security state even if profile trigger is slow.
CREATE OR REPLACE VIEW public.vw_security_heartbeat AS
SELECT
    u.id as user_id,
    lower(u.email) as email,
    -- Effective Status Logic
    CASE
        WHEN COALESCE(p.is_suspended, false) THEN 'SUSPENDED'
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
LEFT JOIN public.profiles p ON u.id = p.id
LEFT JOIN public.login_security_guards lsg ON lsg.email = lower(u.email)
LEFT JOIN public.staff_profiles sp ON u.id = sp.id;

-- 2. Upgrade the Unified User Profile View
-- This ensures that useAuthSession and other profile-dependent hooks see the harmonized suspension state.
DROP VIEW IF EXISTS public.vw_user_profiles;
CREATE VIEW public.vw_user_profiles
WITH (security_invoker = true)
AS
SELECT
    p.id,
    p.full_name,
    p.phone,
    p.avatar_url,
    -- HARMONIZED SUSPENSION: Manual OR Brute Force
    (COALESCE(p.is_suspended, false) OR lsg.suspended_at IS NOT NULL) as is_suspended,
    p.city_id,
    c.name as city_name,
    p.area_id,
    a.name as area_name,
    CASE
        WHEN adm.id IS NOT NULL THEN adm.role::text
        WHEN sp.id IS NOT NULL THEN (CASE WHEN sp.role = 'director' THEN 'super_admin' ELSE 'staff' END)
        ELSE 'user'
    END as role,
    p.created_at
FROM public.profiles p
LEFT JOIN public.cities c ON p.city_id = c.id
LEFT JOIN public.areas a ON p.area_id = a.id
LEFT JOIN public.admins adm ON p.id = adm.id
LEFT JOIN public.staff_profiles sp ON p.id = sp.id
LEFT JOIN public.login_security_guards lsg ON lsg.user_id = p.id;

-- 3. Upgrade the Security Heartbeat RPC
-- Handles CHECK, FAILURE, and SUCCESS in one atomic call.
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
    v_normalized_email text := lower(trim(p_email));
BEGIN
    -- Resolve the User ID from the Email
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_normalized_email LIMIT 1;

    -- Handle Action (If user exists)
    IF v_user_id IS NOT NULL THEN
        IF p_action = 'FAILURE' THEN
            INSERT INTO public.login_security_guards (email, user_id, failed_attempts, updated_at)
            VALUES (v_normalized_email, v_user_id, 1, now())
            ON CONFLICT (email) DO UPDATE SET
                failed_attempts = LEAST(login_security_guards.failed_attempts + 1, 3),
                suspended_at = CASE
                    WHEN login_security_guards.failed_attempts + 1 >= 3 THEN now()
                    ELSE login_security_guards.suspended_at
                END,
                suspension_reason = 'too_many_wrong_password_attempts',
                updated_at = now();
        ELSIF p_action = 'SUCCESS' THEN
            -- Success clears the brute force guard
            UPDATE public.login_security_guards
            SET failed_attempts = 0,
                suspended_at = NULL,
                suspension_reason = NULL,
                updated_at = now()
            WHERE email = v_normalized_email;
        END IF;
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
    WHERE lower(email) = v_normalized_email;

    -- Safe fallback for unknown users
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

GRANT SELECT ON public.vw_security_heartbeat TO authenticated, service_role;
GRANT SELECT ON public.vw_user_profiles TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_security_heartbeat(text, text) TO anon, authenticated;
