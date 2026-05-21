-- shop_banners_news was omitted from the supabase_realtime publication in
-- 20260511000001_enable_realtime_publication.sql, so Realtime never fired
-- events for banner/news changes.  The ShopDetail page subscribed correctly
-- but received nothing, forcing merchants to logout/login to see approved
-- content.
--
-- Also set REPLICA IDENTITY FULL so DELETE events carry shop_id (needed for
-- the client-side filter  shop_id=eq.<id>  to match on deletions).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname   = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'shop_banners_news'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_banners_news;
  END IF;
END
$$;

ALTER TABLE public.shop_banners_news REPLICA IDENTITY FULL;
