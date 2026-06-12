-- ============================================================================
-- Admin → Merchant broadcast notifications.
--
-- Lets admins push a single notification to every merchant (any user who owns
-- a shop). Because the existing `send_push_on_insert` trigger fires one FCM
-- push per inserted notification row, a broadcast is simply a bulk insert —
-- one row per distinct shop owner. Each merchant therefore receives both an
-- in-dashboard notification and a push, exactly like a direct message.
--
-- Scoping mirrors the shops RLS policy:
--   • super_admin → all merchants in every city
--   • city_admin  → only merchants whose shop sits in the admin's city
--
-- All three functions are SECURITY DEFINER (so they can read shops / write
-- notifications regardless of RLS) but are hard-gated on get_admin_role().
-- The BEFORE INSERT guard `protect_notification_admin_columns` still runs and
-- re-verifies the admin role, stamps created_at, and forces is_read = false.
-- ============================================================================

-- ── 1. Broadcast: insert one notification per distinct merchant ─────────────
CREATE OR REPLACE FUNCTION public.broadcast_notification_to_merchants(
  p_title   text,
  p_message text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role    admin_role := public.get_admin_role();
  v_city_id bigint     := public.get_admin_city();
  v_title   text       := left(coalesce(nullif(trim(p_title), ''), ''), 120);
  v_message text       := left(coalesce(nullif(trim(p_message), ''), ''), 1000);
  v_count   integer;
BEGIN
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: only admins may broadcast notifications.'
      USING ERRCODE = '42501';
  END IF;

  IF v_title = '' OR v_message = '' THEN
    RAISE EXCEPTION 'A title and message are both required.'
      USING ERRCODE = '22023';
  END IF;

  -- One row per distinct shop owner. All rows in this single statement share
  -- the same created_at (one transaction clock), which lets the history view
  -- collapse the batch back into a single entry.
  INSERT INTO public.notifications (user_id, title, message, kind)
  SELECT DISTINCT s.owner_id, v_title, v_message, 'merchant_broadcast'
  FROM public.shops s
  WHERE s.owner_id IS NOT NULL
    AND (v_role = 'super_admin' OR s.city_id = v_city_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 2. Live recipient count for the composer preview ────────────────────────
CREATE OR REPLACE FUNCTION public.get_merchant_recipient_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role    admin_role := public.get_admin_role();
  v_city_id bigint     := public.get_admin_city();
  v_count   integer;
BEGIN
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: only admins may view merchant counts.'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT s.owner_id)
  INTO v_count
  FROM public.shops s
  WHERE s.owner_id IS NOT NULL
    AND (v_role = 'super_admin' OR s.city_id = v_city_id);

  RETURN coalesce(v_count, 0);
END;
$$;

-- ── 3. Aggregated broadcast history (one entry per batch) ───────────────────
CREATE OR REPLACE FUNCTION public.get_merchant_broadcasts(p_limit integer DEFAULT 50)
RETURNS TABLE (
  created_at      timestamptz,
  title           text,
  message         text,
  recipient_count bigint,
  read_count      bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role    admin_role := public.get_admin_role();
  v_city_id bigint     := public.get_admin_city();
BEGIN
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: only admins may view broadcasts.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    n.created_at,
    n.title,
    n.message,
    count(*)                               AS recipient_count,
    count(*) FILTER (WHERE n.is_read)      AS read_count
  FROM public.notifications n
  WHERE n.kind = 'merchant_broadcast'
    AND (
      v_role = 'super_admin'
      OR EXISTS (
        SELECT 1 FROM public.shops s
        WHERE s.owner_id = n.user_id
          AND s.city_id = v_city_id
      )
    )
  GROUP BY n.created_at, n.title, n.message
  ORDER BY n.created_at DESC
  LIMIT greatest(coalesce(p_limit, 50), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.broadcast_notification_to_merchants(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_merchant_recipient_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_merchant_broadcasts(integer) TO authenticated;
