-- The review RPC keeps p_new_end_date for Edge Function compatibility, but
-- the database now computes the authoritative subscription end date. Mark the
-- compatibility parameter as intentionally used so plpgsql lint remains clean.

DO $$
DECLARE
  v_definition text;
  v_updated_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'process_offline_payment_review'
    AND pg_get_function_identity_arguments(p.oid) = 'p_proof_id bigint, p_staff_id uuid, p_action text, p_note text, p_payment_ref text, p_amount numeric, p_plan_key text, p_new_end_date timestamp with time zone, p_merchant_name text, p_shop_name text, p_city_name text';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'process_offline_payment_review function not found.';
  END IF;

  IF position('PERFORM p_new_end_date;' in v_definition) = 0 THEN
    v_updated_definition := replace(
      v_definition,
      E'BEGIN\n  IF NOT EXISTS (',
      E'BEGIN\n  -- Kept for API compatibility; the authoritative end date is computed below.\n  PERFORM p_new_end_date;\n\n  IF NOT EXISTS ('
    );

    IF v_updated_definition = v_definition THEN
      RAISE EXCEPTION 'Could not mark p_new_end_date as used in process_offline_payment_review.';
    END IF;

    EXECUTE v_updated_definition;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.process_offline_payment_review(
  bigint,
  uuid,
  text,
  text,
  text,
  numeric,
  text,
  timestamp with time zone,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_offline_payment_review(
  bigint,
  uuid,
  text,
  text,
  text,
  numeric,
  text,
  timestamp with time zone,
  text,
  text,
  text
) TO service_role;

