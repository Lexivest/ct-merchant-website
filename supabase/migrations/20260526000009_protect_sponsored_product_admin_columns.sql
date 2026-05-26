-- Protect admin-reserved columns on the sponsored_products table.
--
-- What this guard covers:
--
--  INSERT:
--   • Defence-in-depth over RLS: non-staff are hard-blocked.
--   • City staff (city_admin / moderator) may only create ads for their
--     own assigned city — they cannot insert ads into a different city.
--   • Non-super-admins cannot go straight to published/active; their new
--     rows are forced to is_active=false and status clamped to 'draft'
--     or 'pending'. Only super_admin may publish directly on insert.
--   • Stamps created_at and updated_at server-side.
--
--  UPDATE:
--   • city_id and created_at are immutable after insert — ads cannot be
--     moved between cities.
--   • updated_at is always stamped server-side.
--   • City staff can only update ads that belong to their assigned city.
--   • Non-super-admins cannot:
--       – flip is_active from false → true
--       – change status from anything → 'published'
--       – change sort_order (global ordering is a super-admin concern)
--
--  service_role bypasses all guards.

CREATE OR REPLACE FUNCTION public.protect_sponsored_product_admin_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_admin_role     text    := public.get_admin_role()::text;
  v_request_role   text    := coalesce((SELECT auth.role()), '');
  v_is_super_admin boolean := (v_admin_role = 'super_admin');
  v_city_scope     bigint  := public.ctm_current_staff_city_scope();
BEGIN
  -- Trusted server-side flows bypass all guards.
  IF v_request_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Defence-in-depth: RLS already blocks non-staff, but we add a hard
  -- barrier here so a future policy mistake cannot open a bypass.
  IF NOT coalesce(public.ctm_has_staff_access(), false) THEN
    RAISE EXCEPTION 'Unauthorized: only staff may manage sponsored products.'
      USING ERRCODE = '42501';
  END IF;

  -- ── INSERT ─────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_super_admin THEN
      -- City-scoped staff may only create ads for their own city.
      IF v_city_scope IS NULL OR NEW.city_id IS DISTINCT FROM v_city_scope THEN
        RAISE EXCEPTION
          'City staff may only create sponsored products for their assigned city.'
          USING ERRCODE = '42501';
      END IF;

      -- Non-super-admins cannot publish or activate directly on insert.
      NEW.is_active := false;
      IF coalesce(NEW.status, 'draft') NOT IN ('draft', 'pending') THEN
        NEW.status := 'draft';
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
  -- Always refresh server-side.
  NEW.updated_at := timezone('utc', now());

  IF NOT v_is_super_admin THEN
    -- City staff can only update ads that belong to their city.
    IF v_city_scope IS DISTINCT FROM OLD.city_id THEN
      RAISE EXCEPTION
        'City staff may only update sponsored products for their assigned city.'
        USING ERRCODE = '42501';
    END IF;

    -- Cannot activate an ad that was not already active.
    IF NEW.is_active = true AND (OLD.is_active IS NULL OR OLD.is_active = false) THEN
      NEW.is_active := false;
    END IF;

    -- Cannot promote status to 'published' unless it was already published.
    IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
      NEW.status := OLD.status;
    END IF;

    -- Sort order is a global super-admin concern; freeze it.
    NEW.sort_order := OLD.sort_order;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_sponsored_product_admin_columns
  BEFORE INSERT OR UPDATE ON public.sponsored_products
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_sponsored_product_admin_columns();
