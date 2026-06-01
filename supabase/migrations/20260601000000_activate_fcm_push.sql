-- ============================================================================
-- Activate FCM push notifications: the ONLY missing piece is a UNIQUE
-- constraint on fcm_tokens.user_id.
--
-- Verified already present in the remote DB (do NOT re-add):
--   * function public.trigger_fcm_notification()
--   * trigger  public.send_push_on_insert  AFTER INSERT ON notifications
--   * fcm_tokens.device_type column, fcm_tokens.id identity, pg_net extension
--
-- The app upserts one token row per user with onConflict=user_id and the edge
-- function reads a single token per user, so user_id must be UNIQUE.
-- This migration is idempotent.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c   ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
    WHERE n.nspname = 'public'
      AND c.relname = 'fcm_tokens'
      AND i.indisunique
      AND array_length(i.indkey::int[], 1) = 1
      AND a.attname = 'user_id'
  ) THEN
    -- Collapse any pre-existing duplicate user rows, keeping the newest token.
    DELETE FROM public.fcm_tokens a
    USING public.fcm_tokens b
    WHERE a.user_id = b.user_id
      AND a.id < b.id;

    ALTER TABLE public.fcm_tokens
      ADD CONSTRAINT fcm_tokens_user_id_unique UNIQUE (user_id);
  END IF;
END$$;
