-- UNIFIED SECURITY VIEW: The "Complex" Decoder
-- This view merges brute-force data, manual suspensions, and staff roles 
-- into a single source of truth for the login flow.

DROP VIEW IF EXISTS public.vw_user_security_status;

CREATE VIEW public.vw_user_security_status 
WITH (security_invoker = true)
AS
SELECT 
    p.id as user_id,
    p.full_name,
    lower(u.email) as email,
    -- Unified Suspension Logic
    (
        COALESCE(p.is_suspended, false) OR 
        COALESCE(lsg.suspended_at IS NOT NULL, false)
    ) as is_blocked,
    -- Reason Mapping
    CASE 
        WHEN p.is_suspended THEN 'manual_admin_suspension'
        WHEN lsg.suspended_at IS NOT NULL THEN COALESCE(lsg.suspension_reason, 'too_many_wrong_password_attempts')
        ELSE NULL
    END as block_reason,
    -- Staff Status
    (sp.id IS NOT NULL) as is_staff,
    COALESCE(sp.role, 'user') as staff_role,
    -- Brute Force Stats
    COALESCE(lsg.failed_attempts, 0) as failed_attempts,
    GREATEST(0, 3 - COALESCE(lsg.failed_attempts, 0)) as attempts_remaining,
    lsg.suspended_at as brute_force_suspended_at
FROM auth.users u
JOIN public.profiles p ON u.id = p.id
LEFT JOIN public.login_security_guards lsg ON lower(u.email) = lsg.email
LEFT JOIN public.staff_profiles sp ON u.id = sp.id;

ALTER VIEW public.vw_user_security_status OWNER TO postgres;
GRANT SELECT ON public.vw_user_security_status TO authenticated, anon, service_role;
