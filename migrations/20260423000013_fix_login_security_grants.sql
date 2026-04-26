-- Grant necessary permissions for login_security_guards to support unified security views
-- This resolves the "permission denied for table login_security_guards" error when fetching user profiles.

GRANT SELECT ON TABLE public.login_security_guards TO authenticated;
GRANT SELECT ON TABLE public.login_security_guards TO anon;
GRANT SELECT ON TABLE public.login_security_guards TO service_role;
