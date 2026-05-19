-- Migration: add_index_shop_analytics_events_actor_user_id
-- Adds a btree index on shop_analytics_events.actor_user_id to prevent
-- sequential scans on per-user analytics queries from the staff dashboard.

CREATE INDEX IF NOT EXISTS idx_shop_analytics_events_actor_user_id
  ON public.shop_analytics_events USING btree (actor_user_id);
