-- Resolve Supabase duplicate-index lint warnings from Pass 3.
-- Keep the older production indexes and drop the newer equivalent ctm_* copies.

DROP INDEX IF EXISTS public.ctm_shop_banners_news_merchant_idx;
DROP INDEX IF EXISTS public.ctm_shops_owner_idx;
DROP INDEX IF EXISTS public.ctm_wishlist_user_product_idx;
