-- Compatibility wrapper for Supabase's extensions.index_advisor.
-- The advisor calls hypopg_reset() without schema qualification, while HypoPG
-- is installed in the extensions schema. This public wrapper lets that call
-- resolve without modifying the extension-owned advisor function.

CREATE OR REPLACE FUNCTION public.hypopg_reset()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'extensions', 'pg_catalog'
AS $$
  SELECT extensions.hypopg_reset();
$$;

REVOKE ALL ON FUNCTION public.hypopg_reset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hypopg_reset() TO authenticated, service_role;
