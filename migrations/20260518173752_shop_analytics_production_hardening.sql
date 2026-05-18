-- Production hardening for shop_analytics_events — 2026-05-18
--
-- Four issues found by live-DB audit (348 rows, growing):
--   1. Three indexes unused (Supabase advisor) — write overhead on every INSERT
--   2. Identity column is BY DEFAULT — callers can force arbitrary id values
--   3. event_source has no CHECK constraint — 'service_provider' is live in
--      prod (50 rows, emitted by ServiceProvider.jsx) but entirely unvalidated
--   4. Retention is manual-only (staff UI) — automate it with pg_cron

-- ── 1. Drop unused indexes ────────────────────────────────────────────────────
-- These three are flagged by Supabase advisor as never used. Deduplication
-- queries filter by (shop_id, event_type, created_at) first, then apply
-- ctm_shop_analytics_actor_key() — a function call that cannot use column
-- indexes directly. Keeping them just adds ~3 index writes per INSERT.
DROP INDEX IF EXISTS public.ctm_shop_analytics_events_actor_user_idx;
DROP INDEX IF EXISTS public.ctm_shop_analytics_events_actor_email_idx;
DROP INDEX IF EXISTS public.ctm_shop_analytics_events_ip_idx;

-- ── 2. Harden identity column ─────────────────────────────────────────────────
-- BY DEFAULT lets any INSERT specify an explicit id, overriding the sequence.
-- ALWAYS prevents this — correct for an append-only event log where every
-- insert goes through log_shop_analytics_event().
ALTER TABLE public.shop_analytics_events
  ALTER COLUMN id SET GENERATED ALWAYS;

-- ── 3. Add event_source CHECK constraint ─────────────────────────────────────
-- Locks the column to the four values actually used in production. Running a
-- full distinct-scan on 2026-05-18 confirmed exactly these four:
--   shop_detail (262), service_provider (50), repo_search (24), product_detail (12)
-- Update this constraint when a new source is added to the codebase.
ALTER TABLE public.shop_analytics_events
  ADD CONSTRAINT ctm_shop_analytics_event_source_check
    CHECK (event_source IN ('shop_detail', 'service_provider', 'repo_search', 'product_detail'));

-- ── 4. Automated retention via pg_cron ───────────────────────────────────────
-- pg_cron jobs run as the postgres superuser, so they bypass RLS and need no
-- auth context. The existing ctm_purge_old_shop_analytics_data() function has
-- an auth guard (ctm_has_super_staff_access) that would reject a pg_cron call,
-- so we DELETE directly here instead. Retention window matches the manual
-- purge default: 365 days.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'ctm-purge-old-analytics',
  '0 3 * * 0',  -- Every Sunday at 03:00 UTC
  $$DELETE FROM public.shop_analytics_events WHERE created_at < now() - interval '365 days'$$
);

-- ── 5. Document retention policy ─────────────────────────────────────────────
COMMENT ON TABLE public.shop_analytics_events IS
  'Append-only stream of shop analytics events (views and contacts). '
  'Retention: 365 days. Auto-purged every Sunday 03:00 UTC by pg_cron job '
  '''ctm-purge-old-analytics''. Manual override: ctm_purge_old_shop_analytics_data(keep_days).';
