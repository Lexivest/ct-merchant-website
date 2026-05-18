-- UNIFIED SECURITY INTELLIGENCE
-- This migration replaces the "Security Complex" with a single source of truth.

-- 1. Create a simplified, robust tracking table if it somehow got corrupted
CREATE TABLE IF NOT EXISTS public.login_security_guards (
    email text PRIMARY KEY,
    user_id uuid,
    failed_attempts integer NOT NULL DEFAULT 0,
    suspended_at timestamp with time zone,
    suspension_reason text,
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. The Master Security View: Intelligence Layer
CREATE OR REPLACE VIEW public.vw_security_status AS
SELECT 
    u.id,
    u.email,
    COALESCE(p.is_suspended, false) as is_manual_suspended,
    COALESCE(lsg.failed_attempts, 0) as failed_attempts,
    lsg.suspended_at as guard_suspended_at,
    (COALESCE(p.is_suspended, false) OR lsg.suspended_at IS NOT NULL) as is_blocked,
    CASE 
        WHEN p.is_suspended THEN 'MANUAL_SUSPENSION'
        WHEN lsg.suspended_at IS NOT NULL THEN 'BRUTE_FORCE_LOCK'
        ELSE 'CLEAR'
    END as status_code
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.login_security_guards lsg ON lsg.email = lower(u.email);

-- 3. The Only Function the Frontend Needs
CREATE OR REPLACE FUNCTION public.get_user_security_status(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_record record;
BEGIN
    SELECT * INTO v_record FROM public.vw_security_status 
    WHERE lower(email) = lower(trim(p_email));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'NOT_FOUND', 'is_blocked', false, 'remaining_attempts', 3);
    END IF;

    RETURN jsonb_build_object(
        'status', v_record.status_code,
        'is_blocked', v_record.is_blocked,
        'failed_attempts', v_record.failed_attempts,
        'remaining_attempts', GREATEST(0, 3 - v_record.failed_attempts),
        'user_id', v_record.id
    );
END;
$$;

GRANT SELECT ON public.vw_security_status TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_security_status(text) TO anon, authenticated;
