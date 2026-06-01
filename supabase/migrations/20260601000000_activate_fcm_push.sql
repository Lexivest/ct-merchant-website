-- ============================================================================
-- Activate FCM push notifications end-to-end.
--
-- This migration is idempotent and safe to run multiple times. It ensures:
--   1. fcm_tokens.user_id is UNIQUE  (the app upserts one token row per user,
--      and the push edge function reads a single token per user).
--   2. A trigger on public.notifications fires trigger_fcm_notification() on
--      INSERT, which POSTs the new row to the push-notification edge function.
--
-- NOTE: If you ALREADY have a Supabase "Database Webhook" on the notifications
--       table pointing at the push-notification function, DELETE that webhook
--       first — otherwise every notification is sent twice.
-- ============================================================================

-- 1. Ensure exactly one fcm_tokens row per user ------------------------------
DO $$
BEGIN
  -- Only act if there is no single-column UNIQUE index on user_id yet.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
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
      AND a.ctid < b.ctid;

    ALTER TABLE public.fcm_tokens
      ADD CONSTRAINT fcm_tokens_user_id_unique UNIQUE (user_id);
  END IF;
END$$;

-- 2. Fire the push edge function on every new notification -------------------
-- trigger_fcm_notification() already exists (see baseline). Attach it.
DROP TRIGGER IF EXISTS trg_fcm_on_notification_insert ON public.notifications;

CREATE TRIGGER trg_fcm_on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_fcm_notification();
