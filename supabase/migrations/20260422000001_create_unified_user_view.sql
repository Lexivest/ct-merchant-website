
-- FIX: Recreating View with Security Invoker to resolve RLS Warning
DROP VIEW IF EXISTS public.vw_user_profiles;

CREATE VIEW public.vw_user_profiles 
WITH (security_invoker = true)
AS
SELECT 
    p.id,
    p.full_name,
    p.phone,
    p.avatar_url,
    p.is_suspended,
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
LEFT JOIN public.staff_profiles sp ON p.id = sp.id;

ALTER VIEW public.vw_user_profiles OWNER TO postgres;
GRANT SELECT ON TABLE public.vw_user_profiles TO authenticated;
GRANT SELECT ON TABLE public.vw_user_profiles TO service_role;
