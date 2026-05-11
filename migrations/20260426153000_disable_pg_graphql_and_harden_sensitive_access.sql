-- We do not use Supabase GraphQL in this project, so disable the extension
-- to stop exposing public schema metadata through /graphql/v1 introspection.
DROP EXTENSION IF EXISTS pg_graphql;

-- login_security_guards should only be accessed through SECURITY DEFINER RPCs
-- and privileged backend roles, never directly by anon clients.
REVOKE ALL ON TABLE public.login_security_guards FROM PUBLIC;
REVOKE ALL ON TABLE public.login_security_guards FROM anon;
REVOKE ALL ON TABLE public.login_security_guards FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.login_security_guards TO service_role;

-- abuse_reports is a sensitive workflow table and should not use public-facing
-- RLS policies. Merchants may create and read their own reports; staff may
-- review and manage all reports.
REVOKE ALL ON TABLE public.abuse_reports FROM PUBLIC;
REVOKE ALL ON TABLE public.abuse_reports FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.abuse_reports TO authenticated;
GRANT ALL ON TABLE public.abuse_reports TO service_role;

DROP POLICY IF EXISTS "Unified Abuse Reports Delete" ON public.abuse_reports;
DROP POLICY IF EXISTS "Unified Abuse Reports Insert" ON public.abuse_reports;
DROP POLICY IF EXISTS "Unified Abuse Reports Select" ON public.abuse_reports;
DROP POLICY IF EXISTS "Unified Abuse Reports Update" ON public.abuse_reports;

CREATE POLICY "CTM abuse reports select"
ON public.abuse_reports
FOR SELECT
TO authenticated
USING (
  reporter_id = (SELECT auth.uid())
  OR (SELECT public.ctm_has_staff_access())
);

CREATE POLICY "CTM abuse reports insert"
ON public.abuse_reports
FOR INSERT
TO authenticated
WITH CHECK (
  reporter_id = (SELECT auth.uid())
  OR (SELECT public.ctm_has_staff_access())
);

CREATE POLICY "CTM abuse reports update"
ON public.abuse_reports
FOR UPDATE
TO authenticated
USING ((SELECT public.ctm_has_staff_access()))
WITH CHECK ((SELECT public.ctm_has_staff_access()));

CREATE POLICY "CTM abuse reports delete"
ON public.abuse_reports
FOR DELETE
TO authenticated
USING ((SELECT public.ctm_has_staff_access()));
