-- ─────────────────────────────────────────────────────────────────────────────
-- Fix "multiple_permissive_policies" lint warnings on flash_sales and
-- ticker_messages (SELECT for authenticated role).
--
-- Root cause:
--   Both tables have a *_public_read policy with no TO clause (defaults to
--   PUBLIC, which includes the authenticated role) AND a *_staff_select_all
--   policy scoped TO authenticated.  PostgreSQL evaluates every permissive
--   matching policy, so two SELECT policies fire for every authenticated query
--   — a performance hit and a lint warning.
--
-- Fix:
--   1. Drop both overlapping SELECT policies.
--   2. Recreate *_public_read scoped TO anon only.
--   3. Add a single *_authenticated_select policy for authenticated that
--      merges both conditions: regular users see only active/live records;
--      staff see all rows via ctm_has_staff_access().
-- ─────────────────────────────────────────────────────────────────────────────


-- ── flash_sales ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "flash_sales_public_read"    ON public.flash_sales;
DROP POLICY IF EXISTS "flash_sales_staff_select_all" ON public.flash_sales;

-- Unauthenticated visitors: only active, live sales
CREATE POLICY "flash_sales_anon_read"
  ON public.flash_sales FOR SELECT
  TO anon
  USING (
    is_active = true
    AND starts_at <= timezone('utc', now())
    AND ends_at   >  timezone('utc', now())
  );

-- Authenticated users: same live-sale filter, OR staff bypass to see all rows
CREATE POLICY "flash_sales_authenticated_select"
  ON public.flash_sales FOR SELECT
  TO authenticated
  USING (
    (
      is_active = true
      AND starts_at <= timezone('utc', now())
      AND ends_at   >  timezone('utc', now())
    )
    OR public.ctm_has_staff_access()
  );


-- ── ticker_messages ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ticker_messages_public_read"      ON public.ticker_messages;
DROP POLICY IF EXISTS "ticker_messages_staff_select_all" ON public.ticker_messages;

-- Unauthenticated visitors: only active messages
CREATE POLICY "ticker_messages_anon_read"
  ON public.ticker_messages FOR SELECT
  TO anon
  USING (is_active = true);

-- Authenticated users: active messages, OR staff bypass to see all rows
CREATE POLICY "ticker_messages_authenticated_select"
  ON public.ticker_messages FOR SELECT
  TO authenticated
  USING (is_active = true OR public.ctm_has_staff_access());
