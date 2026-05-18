-- Remove the obsolete 11-argument shop registration RPC that referenced
-- the retired video_kyc_url column.

DROP FUNCTION IF EXISTS public.register_or_update_shop(
  text, text, text, text, text,
  bigint, bigint,
  text, text, text, text
);
