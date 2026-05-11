-- Performance hardening:
-- Add a covering index for the shop_analytics_events.product_id foreign key.
-- This avoids slower FK maintenance and product-linked analytics lookups.

CREATE INDEX IF NOT EXISTS ctm_shop_analytics_events_product_idx
  ON public.shop_analytics_events (product_id);
