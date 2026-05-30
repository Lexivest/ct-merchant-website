-- ─────────────────────────────────────────────────────────────────────────────
-- Fix cities RLS: only expose cities where is_open = true AND is_active = true
--
-- Previous policy used USING (true) which returned every city row to anon
-- and authenticated callers regardless of whether the city was open/active.
-- Both columns are nullable, so we coalesce to false for safety.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS cities_select_public ON public.cities;

CREATE POLICY cities_select_public ON public.cities
  FOR SELECT
  TO anon, authenticated
  USING (coalesce(is_open, false) = true AND coalesce(is_active, false) = true);
