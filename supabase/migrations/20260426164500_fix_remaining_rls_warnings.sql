-- Resolve remaining RLS advisor warnings without changing product behavior.

-- 1. newsletter_subscriptions:
-- Keep public newsletter signup open, but replace the always-true insert
-- policy with real input guards so the policy is not effectively bypassing
-- RLS checks.
DROP POLICY IF EXISTS "Anyone can subscribe to newsletter" ON public.newsletter_subscriptions;

CREATE POLICY "Anyone can subscribe to newsletter"
ON public.newsletter_subscriptions
FOR INSERT
TO public
WITH CHECK (
  NULLIF(trim(COALESCE(full_name, '')), '') IS NOT NULL
  AND char_length(trim(COALESCE(full_name, ''))) BETWEEN 2 AND 120
  AND NULLIF(trim(COALESCE(email, '')), '') IS NOT NULL
  AND char_length(trim(COALESCE(email, ''))) <= 320
  AND position('@' IN trim(COALESCE(email, ''))) > 1
);

-- 2. daily_site_visits:
-- Staff reads this directly for the dashboard; writes remain backend-only.
DROP POLICY IF EXISTS "CTM daily site visits staff read" ON public.daily_site_visits;

CREATE POLICY "CTM daily site visits staff read"
ON public.daily_site_visits
FOR SELECT
TO authenticated
USING ((SELECT public.ctm_has_staff_access()));

-- 3. login_security_guards:
-- This table should only be reached through security-definer functions.
DROP POLICY IF EXISTS "CTM login guards no direct select" ON public.login_security_guards;
DROP POLICY IF EXISTS "CTM login guards no direct insert" ON public.login_security_guards;
DROP POLICY IF EXISTS "CTM login guards no direct update" ON public.login_security_guards;
DROP POLICY IF EXISTS "CTM login guards no direct delete" ON public.login_security_guards;

CREATE POLICY "CTM login guards no direct select"
ON public.login_security_guards
FOR SELECT
TO public
USING (false);

CREATE POLICY "CTM login guards no direct insert"
ON public.login_security_guards
FOR INSERT
TO public
WITH CHECK (false);

CREATE POLICY "CTM login guards no direct update"
ON public.login_security_guards
FOR UPDATE
TO public
USING (false)
WITH CHECK (false);

CREATE POLICY "CTM login guards no direct delete"
ON public.login_security_guards
FOR DELETE
TO public
USING (false);

-- 4. repo_search_rate_limits:
-- Internal anti-abuse table, no client-side direct access.
DROP POLICY IF EXISTS "CTM repo search rate limits no direct select" ON public.repo_search_rate_limits;
DROP POLICY IF EXISTS "CTM repo search rate limits no direct insert" ON public.repo_search_rate_limits;
DROP POLICY IF EXISTS "CTM repo search rate limits no direct update" ON public.repo_search_rate_limits;
DROP POLICY IF EXISTS "CTM repo search rate limits no direct delete" ON public.repo_search_rate_limits;

CREATE POLICY "CTM repo search rate limits no direct select"
ON public.repo_search_rate_limits
FOR SELECT
TO public
USING (false);

CREATE POLICY "CTM repo search rate limits no direct insert"
ON public.repo_search_rate_limits
FOR INSERT
TO public
WITH CHECK (false);

CREATE POLICY "CTM repo search rate limits no direct update"
ON public.repo_search_rate_limits
FOR UPDATE
TO public
USING (false)
WITH CHECK (false);

CREATE POLICY "CTM repo search rate limits no direct delete"
ON public.repo_search_rate_limits
FOR DELETE
TO public
USING (false);
