-- Enable Supabase realtime for all tables that the dashboard subscribes to,
-- and set REPLICA IDENTITY FULL on tables where DELETE events must carry
-- non-PK columns (e.g. shop_id on products, user_id on notifications).
--
-- Idempotent: safe to run on a project that already has some or all tables
-- enabled via the Dashboard.

-- ── Realtime publication ────────────────────────────────────────────────────

DO $$
DECLARE
  tables text[] := ARRAY[
    'shops',
    'products',
    'featured_city_banners',
    'sponsored_products',
    'staff_discoveries',
    'notifications',
    'wishlist',
    'shop_likes',
    'announcements',
    'categories',
    'physical_verification_payments',
    'offline_payment_proofs'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;

-- ── Replica identity ────────────────────────────────────────────────────────
-- products: DELETE events need shop_id (not the PK) so the dashboard can
--   decide whether the deleted product belongs to a visible city shop before
--   triggering an RPC re-fetch. Without FULL, shop_id is absent in payload.old
--   and every product deletion causes a spurious dynamic re-fetch for every
--   connected user across all cities.
ALTER TABLE public.products REPLICA IDENTITY FULL;

-- notifications: DELETE events need user_id so the direct setLocalData patch
--   in the dashboard can confirm the row belongs to the current user before
--   removing it from the list.
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- shops: UPDATE events where subscription filter is city_id=eq.N already
--   work with DEFAULT identity (filter applied to new.city_id). FULL is not
--   strictly required here but ensures old.city_id is present for edge cases
--   such as a shop being moved between cities.
ALTER TABLE public.shops REPLICA IDENTITY FULL;
