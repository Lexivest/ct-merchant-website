-- Market Ticker Messages
--
-- A lightweight broadcast strip displayed in the market dashboard after
-- the first shop row.  Staff post short messages (≤ 120 chars) targeted
-- at a specific city or globally (city_id IS NULL for super-admins only).
--
-- Guard trigger behaviour mirrors protect_sponsored_product_admin_columns:
--   • service_role bypasses all checks.
--   • Non-staff writes raise a hard error (defence-in-depth over RLS).
--   • city_id, created_at, and created_by are immutable after INSERT.
--   • City-scoped staff may only write messages for their own city.
--   • sort_order is a super-admin-only concern on UPDATE.

-- ── Table ──────────────────────────────────────────────────────────────────
CREATE TABLE public.ticker_messages (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  message     text        NOT NULL
                          CHECK (char_length(message) BETWEEN 1 AND 120),
  is_active   boolean     NOT NULL DEFAULT true,
  city_id     bigint      REFERENCES public.cities(id) ON DELETE CASCADE,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  image_url   text
);

COMMENT ON TABLE  public.ticker_messages                IS 'Short broadcast messages shown in the market dashboard ticker bar.';
COMMENT ON COLUMN public.ticker_messages.city_id        IS 'NULL = shown in every city (super-admin only). Non-null = city-specific.';
COMMENT ON COLUMN public.ticker_messages.sort_order     IS 'Lower values display first. Only super-admins may change this.';

-- Fast lookup by city + active status
CREATE INDEX ticker_messages_city_active_idx
  ON public.ticker_messages (city_id, is_active, sort_order, created_at DESC);

-- ── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.ticker_messages ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read active messages.
CREATE POLICY "ticker_messages_public_read"
  ON public.ticker_messages FOR SELECT
  USING (is_active = true);

-- All write operations require staff access; the trigger validates further.
CREATE POLICY "ticker_messages_staff_insert"
  ON public.ticker_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.ctm_has_staff_access());

CREATE POLICY "ticker_messages_staff_update"
  ON public.ticker_messages FOR UPDATE
  TO authenticated
  USING  (public.ctm_has_staff_access())
  WITH CHECK (public.ctm_has_staff_access());

CREATE POLICY "ticker_messages_staff_delete"
  ON public.ticker_messages FOR DELETE
  TO authenticated
  USING (public.ctm_has_staff_access());

-- Staff also need SELECT access to their own rows (including inactive ones).
CREATE POLICY "ticker_messages_staff_select_all"
  ON public.ticker_messages FOR SELECT
  TO authenticated
  USING (public.ctm_has_staff_access());

-- ── Guard Trigger ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_ticker_message_admin_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_admin_role   text    := public.get_admin_role()::text;
  v_request_role text    := coalesce((SELECT auth.role()), '');
  v_is_super     boolean := (v_admin_role = 'super_admin');
  v_city_scope   bigint  := public.ctm_current_staff_city_scope();
BEGIN
  -- Trusted server-side flows bypass all guards.
  IF v_request_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Defence-in-depth: RLS already blocks non-staff, but add a hard barrier.
  IF NOT coalesce(public.ctm_has_staff_access(), false) THEN
    RAISE EXCEPTION 'Unauthorized: only staff may manage ticker messages.'
      USING ERRCODE = '42501';
  END IF;

  -- ── INSERT ──────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- City staff may only post for their own city.
    -- Super admins may post globally (city_id IS NULL) or for any city.
    IF NOT v_is_super THEN
      IF v_city_scope IS NULL OR NEW.city_id IS DISTINCT FROM v_city_scope THEN
        RAISE EXCEPTION
          'City staff may only create ticker messages for their assigned city.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    NEW.created_at := timezone('utc', now());
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────────
  -- Immutable after insert.
  NEW.city_id    := OLD.city_id;
  NEW.created_at := OLD.created_at;
  NEW.created_by := OLD.created_by;
  -- Always refresh server-side.
  NEW.updated_at := timezone('utc', now());

  IF NOT v_is_super THEN
    -- City staff can only update messages that belong to their city.
    IF v_city_scope IS DISTINCT FROM OLD.city_id THEN
      RAISE EXCEPTION
        'City staff may only update ticker messages for their assigned city.'
        USING ERRCODE = '42501';
    END IF;

    -- Sort order is a global super-admin concern; freeze it.
    NEW.sort_order := OLD.sort_order;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_ticker_message_admin_columns
  BEFORE INSERT OR UPDATE ON public.ticker_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_ticker_message_admin_columns();
