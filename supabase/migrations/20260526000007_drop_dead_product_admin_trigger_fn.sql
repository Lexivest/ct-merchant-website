-- Drop the abandoned draft of protect_product_admin_columns.
--
-- During development a refactored version was written as
-- protect_product_admin_columns_updated but it was never wired to any
-- trigger and is missing critical business logic present in the original:
--   - price / stock validation
--   - discount range enforcement (1–20 %, max 2 per shop, blocked on
--     fairly-used condition)
--   - product limit check (max 30 per shop)
--   - app.product_review_context guard for moderation workflow
--
-- The active trigger (enforce_product_admin_columns) already uses the
-- correct full-featured function. This migration removes the dead draft.

DROP FUNCTION IF EXISTS public.protect_product_admin_columns_updated();
