-- Protect admin-reserved columns on the notifications table.
--
-- What this guard covers:
--
--  INSERT:
--   • Defence-in-depth over RLS: non-admins are hard-blocked even if RLS
--     is misconfigured in a future migration.
--   • Forces created_at = now() and is_read = false — no client can forge
--     a read timestamp or a past creation time.
--   • Requires user_id to be non-null.
--
--  UPDATE:
--   • user_id and created_at are immutable for everyone — a notification
--     cannot be reassigned to a different recipient after the fact.
--   • Non-admins may only toggle is_read; every other column is silently
--     frozen back to its stored value (no error — just a no-op on those
--     fields, consistent with how the product and shop guards behave).
--   • Admins may update content freely (useful for correction of typos
--     or action_path fixes), but cannot reassign user_id.
--
--  service_role (Edge Functions, system triggers) bypasses all guards.

CREATE OR REPLACE FUNCTION public.protect_notification_admin_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_admin_role   text := public.get_admin_role()::text;
  v_request_role text := coalesce((SELECT auth.role()), '');
BEGIN
  -- Trusted server-side flows bypass all guards.
  IF v_request_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- ── INSERT ─────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Belt-and-suspenders over the "Admins Send Notifications" RLS policy.
    IF v_admin_role IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: only admins may create notifications.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'Notifications must target a specific user.'
        USING ERRCODE = '23502';
    END IF;

    -- Always stamp server-side; clients cannot forge timestamps.
    NEW.created_at := timezone('utc', now());
    NEW.is_read    := false;

    RETURN NEW;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────────
  -- Immutable for everyone after creation.
  NEW.id         := OLD.id;
  NEW.user_id    := OLD.user_id;
  NEW.created_at := OLD.created_at;

  IF v_admin_role IS NULL THEN
    -- Regular users may only toggle is_read on their own notification.
    -- (RLS already ensures they can only reach their own rows.)
    -- Every other column is silently restored to prevent quiet corruption.
    NEW.title       := OLD.title;
    NEW.message     := OLD.message;
    NEW.kind        := OLD.kind;
    NEW.action_path := OLD.action_path;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_notification_admin_columns
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_notification_admin_columns();
