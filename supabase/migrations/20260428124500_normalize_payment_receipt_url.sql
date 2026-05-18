-- Store the trusted receipt path in receipt_url too. The app signs receipt_path
-- for staff reads; keeping client-supplied external URLs out of the row avoids
-- future UI regressions that might render an untrusted URL.

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
    AND p.proname = 'protect_offline_payment_proof_claims'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'protect_offline_payment_proof_claims function not found.';
  END IF;

  v_updated_definition := replace(
    v_definition,
    E'NEW.receipt_url := coalesce(nullif(trim(coalesce(NEW.receipt_url, '''')), ''''), NEW.receipt_path);',
    E'NEW.receipt_url := NEW.receipt_path;'
  );

  IF v_updated_definition = v_definition THEN
    IF position('NEW.receipt_url := NEW.receipt_path;' in v_definition) = 0 THEN
      RAISE EXCEPTION 'Could not normalize receipt_url assignment.';
    END IF;
  ELSE
    EXECUTE v_updated_definition;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_offline_payment_proof_claims() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_offline_payment_proof_claims() TO service_role;
