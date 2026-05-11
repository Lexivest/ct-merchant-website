-- Monthly city-admin commission and payout workflow.
--
-- Commission is 20% of successful service-fee payments plus paid physical
-- verification fees for the selected month. Promo verification records are
-- excluded because they create no cash inflow.

CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.physical_verification_payments
  ADD COLUMN IF NOT EXISTS shop_id bigint,
  ADD COLUMN IF NOT EXISTS city_id bigint;

CREATE INDEX IF NOT EXISTS physical_verification_payments_shop_created_idx
  ON public.physical_verification_payments (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS physical_verification_payments_city_created_idx
  ON public.physical_verification_payments (city_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'physical_verification_payments_shop_id_fkey'
  ) THEN
    ALTER TABLE public.physical_verification_payments
      ADD CONSTRAINT physical_verification_payments_shop_id_fkey
      FOREIGN KEY (shop_id) REFERENCES public.shops(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'physical_verification_payments_city_id_fkey'
  ) THEN
    ALTER TABLE public.physical_verification_payments
      ADD CONSTRAINT physical_verification_payments_city_id_fkey
      FOREIGN KEY (city_id) REFERENCES public.cities(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ctm_enrich_physical_payment_city_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_shop_id bigint;
  v_city_id bigint;
  v_city_name text;
BEGIN
  IF NEW.shop_id IS NOT NULL AND NEW.city_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.shop_id IS NOT NULL THEN
    SELECT s.id, s.city_id, c.name
    INTO v_shop_id, v_city_id, v_city_name
    FROM public.shops s
    LEFT JOIN public.cities c ON c.id = s.city_id
    WHERE s.id = NEW.shop_id;
  END IF;

  IF v_shop_id IS NULL THEN
    SELECT s.id, s.city_id, c.name
    INTO v_shop_id, v_city_id, v_city_name
    FROM public.shops s
    LEFT JOIN public.cities c ON c.id = s.city_id
    WHERE s.owner_id = NEW.merchant_id
    ORDER BY
      CASE
        WHEN NEW.city_id IS NOT NULL AND s.city_id = NEW.city_id THEN 0
        WHEN nullif(trim(coalesce(NEW.city, '')), '') IS NOT NULL
          AND lower(c.name) = lower(trim(NEW.city)) THEN 1
        ELSE 2
      END,
      s.created_at DESC NULLS LAST,
      s.id DESC
    LIMIT 1;
  END IF;

  NEW.shop_id := coalesce(NEW.shop_id, v_shop_id);
  NEW.city_id := coalesce(NEW.city_id, v_city_id);
  NEW.city := coalesce(nullif(trim(coalesce(NEW.city, '')), ''), v_city_name, NEW.city);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ctm_enrich_physical_payment_city_scope()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_enrich_physical_payment_city_scope()
  TO service_role;

DROP TRIGGER IF EXISTS enrich_physical_payment_city_scope
  ON public.physical_verification_payments;

CREATE TRIGGER enrich_physical_payment_city_scope
BEFORE INSERT OR UPDATE OF merchant_id, shop_id, city_id, city
ON public.physical_verification_payments
FOR EACH ROW
EXECUTE FUNCTION public.ctm_enrich_physical_payment_city_scope();

UPDATE public.physical_verification_payments p
SET
  shop_id = coalesce(p.shop_id, scoped.shop_id),
  city_id = coalesce(p.city_id, scoped.city_id),
  city = coalesce(nullif(trim(coalesce(p.city, '')), ''), scoped.city_name, p.city)
FROM (
  SELECT DISTINCT ON (p2.id)
    p2.id,
    s.id AS shop_id,
    s.city_id,
    c.name AS city_name
  FROM public.physical_verification_payments p2
  JOIN public.shops s
    ON s.owner_id = p2.merchant_id
  LEFT JOIN public.cities c
    ON c.id = s.city_id
  ORDER BY
    p2.id,
    CASE
      WHEN p2.city_id IS NOT NULL AND s.city_id = p2.city_id THEN 0
      WHEN nullif(trim(coalesce(p2.city, '')), '') IS NOT NULL
        AND lower(c.name) = lower(trim(p2.city)) THEN 1
      ELSE 2
    END,
    s.created_at DESC NULLS LAST,
    s.id DESC
) scoped
WHERE p.id = scoped.id
  AND (p.shop_id IS NULL OR p.city_id IS NULL);

CREATE TABLE IF NOT EXISTS public.city_admin_commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_month date NOT NULL,
  city_id bigint NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  gross_inflow numeric NOT NULL DEFAULT 0,
  subscription_inflow numeric NOT NULL DEFAULT 0,
  verification_inflow numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 0.20,
  commission_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  paid_at timestamp with time zone,
  paid_by uuid,
  receipt_path text,
  receipt_url text,
  payment_reference text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT city_admin_commission_payouts_status_check
    CHECK (status IN ('unpaid', 'paid')),
  CONSTRAINT city_admin_commission_payouts_month_start_check
    CHECK (commission_month = date_trunc('month', commission_month::timestamp)::date),
  CONSTRAINT city_admin_commission_payouts_rate_check
    CHECK (commission_rate >= 0 AND commission_rate <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS city_admin_commission_payouts_month_city_uidx
  ON public.city_admin_commission_payouts (commission_month, city_id);

CREATE INDEX IF NOT EXISTS city_admin_commission_payouts_city_month_idx
  ON public.city_admin_commission_payouts (city_id, commission_month DESC);

CREATE OR REPLACE FUNCTION public.set_city_admin_commission_payout_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_city_admin_commission_payout_updated_at()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_city_admin_commission_payout_updated_at()
  TO service_role;

DROP TRIGGER IF EXISTS set_city_admin_commission_payout_updated_at
  ON public.city_admin_commission_payouts;

CREATE TRIGGER set_city_admin_commission_payout_updated_at
BEFORE UPDATE ON public.city_admin_commission_payouts
FOR EACH ROW
EXECUTE FUNCTION public.set_city_admin_commission_payout_updated_at();

ALTER TABLE public.city_admin_commission_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CTM commission payouts read" ON public.city_admin_commission_payouts;
DROP POLICY IF EXISTS "CTM commission payouts no direct insert" ON public.city_admin_commission_payouts;
DROP POLICY IF EXISTS "CTM commission payouts no direct update" ON public.city_admin_commission_payouts;
DROP POLICY IF EXISTS "CTM commission payouts no direct delete" ON public.city_admin_commission_payouts;

CREATE POLICY "CTM commission payouts read"
ON public.city_admin_commission_payouts
FOR SELECT
TO authenticated
USING (
  public.ctm_has_super_staff_access()
  OR (
    public.get_admin_role() = 'city_admin'::public.admin_role
    AND public.get_admin_city() IS NOT NULL
    AND city_id = public.get_admin_city()
  )
);

CREATE POLICY "CTM commission payouts no direct insert"
ON public.city_admin_commission_payouts
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "CTM commission payouts no direct update"
ON public.city_admin_commission_payouts
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "CTM commission payouts no direct delete"
ON public.city_admin_commission_payouts
FOR DELETE
TO authenticated
USING (false);

CREATE OR REPLACE FUNCTION private.ctm_get_staff_commission_summary(
  p_month date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_role public.admin_role := private.get_admin_role();
  v_city_id bigint := private.get_admin_city();
  v_month_start date := date_trunc('month', coalesce(p_month, (now() AT TIME ZONE 'Africa/Lagos')::date)::timestamp)::date;
  v_current_month date := date_trunc('month', (now() AT TIME ZONE 'Africa/Lagos')::date)::date;
  v_start_at timestamp with time zone;
  v_end_at timestamp with time zone;
  v_commission_rate numeric := 0.20;
  v_rows jsonb := '[]'::jsonb;
  v_subscription_total numeric := 0;
  v_verification_total numeric := 0;
  v_gross_total numeric := 0;
  v_commission_total numeric := 0;
  v_paid_total numeric := 0;
  v_unpaid_total numeric := 0;
BEGIN
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Admin operation role required.' USING ERRCODE = '42501';
  END IF;

  IF v_role <> 'super_admin'::public.admin_role
    AND (v_role <> 'city_admin'::public.admin_role OR v_city_id IS NULL) THEN
    RAISE EXCEPTION 'City admin or super admin access required.' USING ERRCODE = '42501';
  END IF;

  v_start_at := v_month_start::timestamp AT TIME ZONE 'Africa/Lagos';
  v_end_at := (v_month_start + interval '1 month')::timestamp AT TIME ZONE 'Africa/Lagos';

  WITH scoped_cities AS (
    SELECT c.id, c.name, c.state
    FROM public.cities c
    WHERE v_role = 'super_admin'::public.admin_role
      OR c.id = v_city_id
  ),
  city_admins AS (
    SELECT
      a.city_id,
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'name', coalesce(sp.full_name, a.full_name, 'City Admin'),
          'staff_role', sp.role,
          'department', sp.department
        )
        ORDER BY coalesce(sp.full_name, a.full_name, 'City Admin')
      ) AS admins
    FROM public.admins a
    LEFT JOIN public.staff_profiles sp
      ON sp.id = a.id
    WHERE a.role = 'city_admin'::public.admin_role
    GROUP BY a.city_id
  ),
  service_totals AS (
    SELECT
      s.city_id,
      sum(coalesce(sfp.amount, 0))::numeric AS amount
    FROM public.service_fee_payments sfp
    JOIN public.shops s
      ON s.id = sfp.shop_id
    WHERE sfp.status = 'success'
      AND sfp.created_at >= v_start_at
      AND sfp.created_at < v_end_at
    GROUP BY s.city_id
  ),
  service_payment_rows AS (
    SELECT
      s.city_id,
      jsonb_build_object(
        'id', 'service:' || sfp.id::text,
        'source', 'service_fee_payments',
        'fee_type', 'subscription',
        'fee_label', 'Subscription/Renewal',
        'subscription_plan', sfp.plan,
        'merchant_id', sfp.merchant_id,
        'merchant_name', coalesce(pr.full_name, 'Merchant'),
        'shop_id', sfp.shop_id,
        'shop_name', coalesce(s.name, 'Shop #' || sfp.shop_id::text),
        'amount', coalesce(sfp.amount, 0),
        'payment_ref', sfp.payment_ref,
        'paid_at', sfp.created_at
      ) AS payment,
      sfp.created_at AS paid_at
    FROM public.service_fee_payments sfp
    JOIN public.shops s
      ON s.id = sfp.shop_id
    LEFT JOIN public.profiles pr
      ON pr.id = sfp.merchant_id
    WHERE sfp.status = 'success'
      AND sfp.created_at >= v_start_at
      AND sfp.created_at < v_end_at
  ),
  physical_resolved AS (
    SELECT
      coalesce(p.city_id, direct_shop.city_id, owner_shop.city_id, named_city.id) AS city_id,
      coalesce(p.shop_id, direct_shop.id, owner_shop.shop_id) AS shop_id,
      coalesce(direct_shop.name, owner_shop.shop_name, nullif(trim(coalesce(p.shop_name, '')), ''), 'Shop') AS shop_name,
      p.id AS payment_id,
      p.merchant_id,
      coalesce(pr.full_name, nullif(trim(coalesce(p.merchant_name, '')), ''), 'Merchant') AS merchant_name,
      coalesce(p.amount, 0)::numeric AS amount,
      p.payment_ref,
      p.created_at
    FROM public.physical_verification_payments p
    LEFT JOIN public.shops direct_shop
      ON direct_shop.id = p.shop_id
    LEFT JOIN public.profiles pr
      ON pr.id = p.merchant_id
    LEFT JOIN public.cities named_city
      ON lower(named_city.name) = lower(trim(coalesce(p.city, '')))
    LEFT JOIN LATERAL (
      SELECT s.id AS shop_id, s.city_id, s.name AS shop_name
      FROM public.shops s
      LEFT JOIN public.cities c ON c.id = s.city_id
      WHERE s.owner_id = p.merchant_id
      ORDER BY
        CASE
          WHEN p.city_id IS NOT NULL AND s.city_id = p.city_id THEN 0
          WHEN p.shop_id IS NOT NULL AND s.id = p.shop_id THEN 0
          WHEN nullif(trim(coalesce(p.city, '')), '') IS NOT NULL
            AND lower(c.name) = lower(trim(p.city)) THEN 1
          ELSE 2
        END,
        s.created_at DESC NULLS LAST,
        s.id DESC
      LIMIT 1
    ) owner_shop ON true
    WHERE p.status = 'success'
      AND coalesce(p.amount, 0) > 0
      AND coalesce(p.payment_ref, '') !~* '^PROMO_'
      AND p.created_at >= v_start_at
      AND p.created_at < v_end_at
  ),
  physical_totals AS (
    SELECT city_id, sum(amount)::numeric AS amount
    FROM physical_resolved
    WHERE city_id IS NOT NULL
    GROUP BY city_id
  ),
  physical_payment_rows AS (
    SELECT
      city_id,
      jsonb_build_object(
        'id', 'physical:' || payment_id::text,
        'source', 'physical_verification_payments',
        'fee_type', 'physical_verification',
        'fee_label', 'Verification Fee',
        'subscription_plan', NULL,
        'merchant_id', merchant_id,
        'merchant_name', merchant_name,
        'shop_id', shop_id,
        'shop_name', shop_name,
        'amount', amount,
        'payment_ref', payment_ref,
        'paid_at', created_at
      ) AS payment,
      created_at AS paid_at
    FROM physical_resolved
    WHERE city_id IS NOT NULL
  ),
  city_payment_rows AS (
    SELECT
      city_id,
      coalesce(
        jsonb_agg(payment ORDER BY paid_at DESC),
        '[]'::jsonb
      ) AS payments,
      count(*)::integer AS payment_count
    FROM (
      SELECT city_id, payment, paid_at FROM service_payment_rows
      UNION ALL
      SELECT city_id, payment, paid_at FROM physical_payment_rows
    ) combined_payments
    GROUP BY city_id
  ),
  rows AS (
    SELECT
      c.id AS city_id,
      c.name AS city_name,
      c.state,
      coalesce(st.amount, 0)::numeric AS subscription_total,
      coalesce(pt.amount, 0)::numeric AS verification_total,
      (coalesce(st.amount, 0) + coalesce(pt.amount, 0))::numeric AS gross_inflow,
      round((coalesce(st.amount, 0) + coalesce(pt.amount, 0)) * v_commission_rate, 2)::numeric AS commission_amount,
      p.id AS payout_id,
      coalesce(p.status, 'unpaid') AS payout_status,
      p.paid_at,
      p.paid_by,
      p.receipt_path,
      p.receipt_url,
      p.payment_reference,
      p.note,
      p.updated_at AS payout_updated_at,
      coalesce(ca.admins, '[]'::jsonb) AS city_admins,
      coalesce(cpr.payments, '[]'::jsonb) AS payments,
      coalesce(cpr.payment_count, 0)::integer AS payment_count
    FROM scoped_cities c
    LEFT JOIN service_totals st
      ON st.city_id = c.id
    LEFT JOIN physical_totals pt
      ON pt.city_id = c.id
    LEFT JOIN public.city_admin_commission_payouts p
      ON p.city_id = c.id
     AND p.commission_month = v_month_start
    LEFT JOIN city_admins ca
      ON ca.city_id = c.id
    LEFT JOIN city_payment_rows cpr
      ON cpr.city_id = c.id
  )
  SELECT
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'city_id', city_id,
          'city_name', city_name,
          'state', state,
          'subscription_total', subscription_total,
          'verification_total', verification_total,
          'gross_inflow', gross_inflow,
          'commission_rate', v_commission_rate,
          'commission_amount', commission_amount,
          'payout_id', payout_id,
          'payout_status', payout_status,
          'paid_at', paid_at,
          'paid_by', paid_by,
          'receipt_path', receipt_path,
          'receipt_url', receipt_url,
          'payment_reference', payment_reference,
          'note', note,
          'payout_updated_at', payout_updated_at,
          'city_admins', city_admins,
          'payments', payments,
          'payment_count', payment_count,
          'has_activity', gross_inflow > 0 OR payout_id IS NOT NULL
        )
        ORDER BY city_name
      ),
      '[]'::jsonb
    ),
    coalesce(sum(subscription_total), 0),
    coalesce(sum(verification_total), 0),
    coalesce(sum(gross_inflow), 0),
    coalesce(sum(commission_amount), 0),
    coalesce(sum(commission_amount) FILTER (WHERE payout_status = 'paid'), 0),
    coalesce(sum(commission_amount) FILTER (WHERE payout_status <> 'paid'), 0)
  INTO
    v_rows,
    v_subscription_total,
    v_verification_total,
    v_gross_total,
    v_commission_total,
    v_paid_total,
    v_unpaid_total
  FROM rows;

  RETURN jsonb_build_object(
    'month_start', v_month_start,
    'month_end_exclusive', (v_month_start + interval '1 month')::date,
    'is_closed', v_month_start < v_current_month,
    'commission_rate', v_commission_rate,
    'scope', CASE WHEN v_role = 'super_admin'::public.admin_role THEN 'all_cities' ELSE 'city' END,
    'actor_role', v_role,
    'actor_city_id', v_city_id,
    'totals', jsonb_build_object(
      'subscription_total', v_subscription_total,
      'verification_total', v_verification_total,
      'gross_inflow', v_gross_total,
      'commission_amount', v_commission_total,
      'paid_commission', v_paid_total,
      'unpaid_commission', v_unpaid_total
    ),
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION private.ctm_get_staff_commission_summary(date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_get_staff_commission_summary(date)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ctm_get_staff_commission_summary(
  p_month date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT private.ctm_get_staff_commission_summary(p_month);
$$;

REVOKE ALL ON FUNCTION public.ctm_get_staff_commission_summary(date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_get_staff_commission_summary(date)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.ctm_mark_city_admin_commission_paid(
  p_month date,
  p_city_id bigint,
  p_receipt_path text,
  p_receipt_url text DEFAULT NULL::text,
  p_payment_reference text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_month_start date := date_trunc('month', coalesce(p_month, (now() AT TIME ZONE 'Africa/Lagos')::date)::timestamp)::date;
  v_current_month date := date_trunc('month', (now() AT TIME ZONE 'Africa/Lagos')::date)::date;
  v_start_at timestamp with time zone;
  v_end_at timestamp with time zone;
  v_city public.cities%rowtype;
  v_subscription_total numeric := 0;
  v_verification_total numeric := 0;
  v_gross_total numeric := 0;
  v_commission_rate numeric := 0.20;
  v_commission_amount numeric := 0;
  v_receipt_path text := nullif(trim(coalesce(p_receipt_path, '')), '');
  v_receipt_url text := nullif(trim(coalesce(p_receipt_url, '')), '');
  v_payment_reference text := nullif(left(trim(coalesce(p_payment_reference, '')), 120), '');
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  v_payout public.city_admin_commission_payouts%rowtype;
BEGIN
  IF NOT private.ctm_has_super_staff_access() THEN
    RAISE EXCEPTION 'Super admin access required.' USING ERRCODE = '42501';
  END IF;

  IF p_city_id IS NULL OR p_city_id <= 0 THEN
    RAISE EXCEPTION 'A valid city is required.' USING ERRCODE = '22023';
  END IF;

  IF v_month_start >= v_current_month THEN
    RAISE EXCEPTION 'Only completed months can be marked paid.' USING ERRCODE = '22023';
  END IF;

  IF v_receipt_path IS NULL THEN
    RAISE EXCEPTION 'A payment receipt upload is required.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_city
  FROM public.cities
  WHERE id = p_city_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'City not found.' USING ERRCODE = 'P0002';
  END IF;

  v_start_at := v_month_start::timestamp AT TIME ZONE 'Africa/Lagos';
  v_end_at := (v_month_start + interval '1 month')::timestamp AT TIME ZONE 'Africa/Lagos';

  SELECT coalesce(sum(sfp.amount), 0)::numeric
  INTO v_subscription_total
  FROM public.service_fee_payments sfp
  JOIN public.shops s
    ON s.id = sfp.shop_id
  WHERE sfp.status = 'success'
    AND s.city_id = p_city_id
    AND sfp.created_at >= v_start_at
    AND sfp.created_at < v_end_at;

  WITH physical_resolved AS (
    SELECT
      coalesce(p.city_id, direct_shop.city_id, owner_shop.city_id, named_city.id) AS city_id,
      coalesce(p.amount, 0)::numeric AS amount
    FROM public.physical_verification_payments p
    LEFT JOIN public.shops direct_shop
      ON direct_shop.id = p.shop_id
    LEFT JOIN public.cities named_city
      ON lower(named_city.name) = lower(trim(coalesce(p.city, '')))
    LEFT JOIN LATERAL (
      SELECT s.city_id
      FROM public.shops s
      LEFT JOIN public.cities c ON c.id = s.city_id
      WHERE s.owner_id = p.merchant_id
      ORDER BY
        CASE
          WHEN p.city_id IS NOT NULL AND s.city_id = p.city_id THEN 0
          WHEN p.shop_id IS NOT NULL AND s.id = p.shop_id THEN 0
          WHEN nullif(trim(coalesce(p.city, '')), '') IS NOT NULL
            AND lower(c.name) = lower(trim(p.city)) THEN 1
          ELSE 2
        END,
        s.created_at DESC NULLS LAST,
        s.id DESC
      LIMIT 1
    ) owner_shop ON true
    WHERE p.status = 'success'
      AND coalesce(p.amount, 0) > 0
      AND coalesce(p.payment_ref, '') !~* '^PROMO_'
      AND p.created_at >= v_start_at
      AND p.created_at < v_end_at
  )
  SELECT coalesce(sum(amount), 0)::numeric
  INTO v_verification_total
  FROM physical_resolved
  WHERE city_id = p_city_id;

  v_gross_total := coalesce(v_subscription_total, 0) + coalesce(v_verification_total, 0);
  v_commission_amount := round(v_gross_total * v_commission_rate, 2);

  IF v_gross_total <= 0 OR v_commission_amount <= 0 THEN
    RAISE EXCEPTION 'No commission is due for this city and month.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.city_admin_commission_payouts (
    commission_month,
    city_id,
    gross_inflow,
    subscription_inflow,
    verification_inflow,
    commission_rate,
    commission_amount,
    status,
    paid_at,
    paid_by,
    receipt_path,
    receipt_url,
    payment_reference,
    note
  )
  VALUES (
    v_month_start,
    p_city_id,
    v_gross_total,
    v_subscription_total,
    v_verification_total,
    v_commission_rate,
    v_commission_amount,
    'paid',
    now(),
    v_actor_id,
    v_receipt_path,
    v_receipt_url,
    v_payment_reference,
    v_note
  )
  ON CONFLICT (commission_month, city_id)
  DO UPDATE SET
    gross_inflow = excluded.gross_inflow,
    subscription_inflow = excluded.subscription_inflow,
    verification_inflow = excluded.verification_inflow,
    commission_rate = excluded.commission_rate,
    commission_amount = excluded.commission_amount,
    status = 'paid',
    paid_at = excluded.paid_at,
    paid_by = excluded.paid_by,
    receipt_path = excluded.receipt_path,
    receipt_url = excluded.receipt_url,
    payment_reference = excluded.payment_reference,
    note = excluded.note
  RETURNING *
  INTO v_payout;

  PERFORM public.push_user_notification(
    a.id,
    'Commission payment recorded',
    'Your ' || to_char(v_month_start, 'Mon YYYY') || ' city-admin commission for ' || v_city.name || ' has been marked paid.',
    'staff_commission_paid',
    '/staff-commissions'
  )
  FROM public.admins a
  JOIN public.staff_profiles sp
    ON sp.id = a.id
  WHERE a.role = 'city_admin'::public.admin_role
    AND a.city_id = p_city_id;

  RETURN jsonb_build_object(
    'success', true,
    'payout', to_jsonb(v_payout),
    'message', 'Commission payout marked paid.'
  );
END;
$$;

REVOKE ALL ON FUNCTION private.ctm_mark_city_admin_commission_paid(
  date, bigint, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ctm_mark_city_admin_commission_paid(
  date, bigint, text, text, text, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ctm_mark_city_admin_commission_paid(
  p_month date,
  p_city_id bigint,
  p_receipt_path text,
  p_receipt_url text DEFAULT NULL::text,
  p_payment_reference text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $$
  SELECT private.ctm_mark_city_admin_commission_paid(
    p_month,
    p_city_id,
    p_receipt_path,
    p_receipt_url,
    p_payment_reference,
    p_note
  );
$$;

REVOKE ALL ON FUNCTION public.ctm_mark_city_admin_commission_paid(
  date, bigint, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ctm_mark_city_admin_commission_paid(
  date, bigint, text, text, text, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.ctm_staff_can_read_private_storage_object(
  p_bucket_id text,
  p_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_role public.admin_role := private.get_admin_role();
  v_city_id bigint := private.get_admin_city();
BEGIN
  IF p_bucket_id IS NULL OR p_name IS NULL OR p_name = '' OR v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'super_admin'::public.admin_role THEN
    RETURN p_bucket_id IN (
      'id-documents',
      'cac-documents',
      'kyc_videos',
      'kyc-videos',
      'payment-receipts'
    );
  END IF;

  IF v_role <> 'city_admin'::public.admin_role OR v_city_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_bucket_id = 'payment-receipts' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.city_admin_commission_payouts p
      WHERE p.city_id = v_city_id
        AND p.receipt_path = p_name
        AND p.status = 'paid'
    );
  END IF;

  IF p_bucket_id = 'id-documents' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.city_id = v_city_id
        AND public.ctm_storage_path_from_url(s.id_card_url, p_bucket_id) = p_name
    );
  END IF;

  IF p_bucket_id = 'cac-documents' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.city_id = v_city_id
        AND public.ctm_storage_path_from_url(s.cac_certificate_url, p_bucket_id) = p_name
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.ctm_staff_can_read_private_storage_object(text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ctm_staff_can_read_private_storage_object(text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.process_offline_payment_review(
  p_proof_id bigint,
  p_staff_id uuid,
  p_action text,
  p_note text,
  p_payment_ref text DEFAULT NULL::text,
  p_amount numeric DEFAULT NULL::numeric,
  p_plan_key text DEFAULT NULL::text,
  p_new_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_merchant_name text DEFAULT NULL::text,
  p_shop_name text DEFAULT NULL::text,
  p_city_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_proof record;
  v_shop record;
  v_existing_physical record;
  v_final_ref text;
  v_expected_amount numeric;
  v_plan_key text;
  v_base_date timestamp with time zone;
  v_new_end_date timestamp with time zone;
  v_shop_name text;
  v_city_name text;
  v_plan_label text;
  v_end_date_label text;
BEGIN
  PERFORM p_new_end_date;

  IF NOT EXISTS (
    SELECT 1
    FROM public.staff_profiles sp
    JOIN public.admins a ON a.id = sp.id
    WHERE sp.id = p_staff_id
      AND a.role = 'super_admin'::public.admin_role
  ) THEN
    RAISE EXCEPTION 'Super admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_proof
  FROM public.offline_payment_proofs
  WHERE id = p_proof_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment proof not found.';
  END IF;

  SELECT
    s.id,
    s.owner_id,
    s.name,
    s.status,
    s.is_verified,
    s.kyc_status,
    s.subscription_end_date,
    s.city_id,
    c.name AS city_name
  INTO v_shop
  FROM public.shops s
  LEFT JOIN public.cities c ON c.id = s.city_id
  WHERE s.id = v_proof.shop_id
    AND s.owner_id = v_proof.merchant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment proof does not match an owned shop.';
  END IF;

  v_shop_name := coalesce(nullif(trim(p_shop_name), ''), nullif(trim(v_shop.name), ''), 'your shop');
  v_city_name := coalesce(nullif(trim(p_city_name), ''), nullif(trim(v_shop.city_name), ''), 'Unknown City');

  IF v_proof.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'status', v_proof.status,
      'message', 'Payment proof is already ' || v_proof.status
    );
  END IF;

  IF p_action = 'reject' THEN
    UPDATE public.offline_payment_proofs
    SET status = 'rejected',
        review_note = p_note,
        reviewed_by = p_staff_id,
        reviewed_at = now()
    WHERE id = p_proof_id;

    IF v_proof.payment_kind = 'physical_verification' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Verification Receipt Needs Attention',
        'We could not confirm your physical verification payment for "' || v_shop_name || '".'
        || CASE
            WHEN nullif(trim(coalesce(p_note, '')), '') IS NOT NULL THEN ' Staff note: ' || trim(p_note) || '.'
            ELSE ''
           END
        || ' Please upload a clearer receipt or contact support if the transfer has already reached us.',
        'verification_payment_rejected',
        '/remita?shop_id=' || v_proof.shop_id::text
      );
    ELSIF v_proof.payment_kind = 'service_fee' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Service Fee Receipt Needs Attention',
        'We could not confirm the service fee payment for "' || v_shop_name || '".'
        || CASE
            WHEN nullif(trim(coalesce(p_note, '')), '') IS NOT NULL THEN ' Staff note: ' || trim(p_note) || '.'
            ELSE ''
           END
        || ' Please upload a clearer receipt or contact support if payment has already been made.',
        'service_fee_rejected',
        '/service-fee?shop_id=' || v_proof.shop_id::text
      );
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'message', 'Payment proof rejected.');
  END IF;

  IF p_action = 'approve' THEN
    v_final_ref := coalesce(nullif(trim(p_payment_ref), ''), 'OFFLINE_' || p_proof_id::text);

    IF v_proof.payment_kind = 'physical_verification' THEN
      IF v_shop.status IS DISTINCT FROM 'approved'::public.application_status THEN
        RAISE EXCEPTION 'Shop must be digitally approved before physical verification payment can be approved.';
      END IF;

      v_expected_amount := 5000;
      IF v_proof.plan IS NOT NULL OR v_proof.amount::numeric IS DISTINCT FROM v_expected_amount THEN
        RAISE EXCEPTION 'Invalid physical verification payment proof amount.';
      END IF;

      IF p_amount IS NOT NULL AND p_amount IS DISTINCT FROM v_expected_amount THEN
        RAISE EXCEPTION 'Physical verification approval amount mismatch.';
      END IF;

      SELECT * INTO v_existing_physical
      FROM public.physical_verification_payments
      WHERE merchant_id = v_proof.merchant_id AND status = 'success'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.physical_verification_payments (
          merchant_id, merchant_name, shop_name, city, amount, payment_ref, status, shop_id, city_id
        ) VALUES (
          v_proof.merchant_id, p_merchant_name, v_shop_name, v_city_name, v_expected_amount, v_final_ref, 'success', v_shop.id, v_shop.city_id
        );
      ELSE
        v_final_ref := coalesce(nullif(trim(coalesce(v_existing_physical.payment_ref, '')), ''), v_final_ref);
        UPDATE public.physical_verification_payments
        SET
          shop_id = coalesce(shop_id, v_shop.id),
          city_id = coalesce(city_id, v_shop.city_id),
          city = coalesce(nullif(trim(coalesce(city, '')), ''), v_city_name)
        WHERE id = v_existing_physical.id;
      END IF;

    ELSIF v_proof.payment_kind = 'service_fee' THEN
      IF NOT (coalesce(v_shop.is_verified, false) OR v_shop.kyc_status = 'approved') THEN
        RAISE EXCEPTION 'Shop must be physically verified before service fee payment can be approved.';
      END IF;

      v_plan_key := v_proof.plan;
      v_expected_amount := CASE v_plan_key
        WHEN '6_Months' THEN 6000
        WHEN '1_Year' THEN 10000
        ELSE NULL
      END;

      IF v_expected_amount IS NULL THEN
        RAISE EXCEPTION 'Invalid service fee plan.';
      END IF;

      IF p_plan_key IS NOT NULL AND p_plan_key IS DISTINCT FROM v_plan_key THEN
        RAISE EXCEPTION 'Service fee approval plan mismatch.';
      END IF;

      IF v_proof.amount::numeric IS DISTINCT FROM v_expected_amount THEN
        RAISE EXCEPTION 'Invalid service fee payment proof amount.';
      END IF;

      IF p_amount IS NOT NULL AND p_amount IS DISTINCT FROM v_expected_amount THEN
        RAISE EXCEPTION 'Service fee approval amount mismatch.';
      END IF;

      v_base_date := now();
      IF v_shop.subscription_end_date IS NOT NULL AND v_shop.subscription_end_date > v_base_date THEN
        v_base_date := v_shop.subscription_end_date;
      END IF;

      v_new_end_date := CASE v_plan_key
        WHEN '6_Months' THEN v_base_date + interval '6 months'
        WHEN '1_Year' THEN v_base_date + interval '1 year'
      END;

      UPDATE public.shops
      SET subscription_plan = v_plan_key,
          subscription_end_date = v_new_end_date
      WHERE id = v_proof.shop_id AND owner_id = v_proof.merchant_id;

      INSERT INTO public.service_fee_payments (
        merchant_id, shop_id, amount, plan, payment_ref, status
      ) VALUES (
        v_proof.merchant_id, v_proof.shop_id, v_expected_amount, v_plan_key, v_final_ref, 'success'
      );
    ELSE
      RAISE EXCEPTION 'Unknown payment kind: %', v_proof.payment_kind;
    END IF;

    v_plan_label := CASE coalesce(v_plan_key, p_plan_key)
      WHEN '6_Months' THEN '6-month service plan'
      WHEN '1_Year' THEN '1-year service plan'
      ELSE 'service plan'
    END;
    v_end_date_label := CASE
      WHEN v_new_end_date IS NOT NULL THEN to_char(v_new_end_date AT TIME ZONE 'Africa/Lagos', 'DD Mon YYYY')
      ELSE NULL
    END;

    UPDATE public.offline_payment_proofs
    SET status = 'approved',
        review_note = COALESCE(p_note, 'Payment confirmed by staff.'),
        reviewed_by = p_staff_id,
        reviewed_at = now(),
        approval_payment_ref = v_final_ref
    WHERE id = p_proof_id;

    IF v_proof.payment_kind = 'physical_verification' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Verification Fee Confirmed',
        'We have confirmed your physical verification payment for "' || v_shop_name || '". You can now continue to video KYC.',
        'verification_payment_confirmed',
        '/merchant-video-kyc?shop_id=' || v_proof.shop_id::text
      );
    ELSIF v_proof.payment_kind = 'service_fee' THEN
      PERFORM public.push_user_notification(
        v_proof.merchant_id,
        'Service Fee Confirmed',
        '"' || v_shop_name || '" is now on the ' || v_plan_label
        || CASE
            WHEN v_end_date_label IS NOT NULL THEN ' and remains active until ' || v_end_date_label || '.'
            ELSE '.'
           END,
        'service_fee_confirmed',
        '/vendor-panel'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'approved',
      'paymentRef', v_final_ref,
      'plan', v_plan_key,
      'subscriptionEndDate', v_new_end_date,
      'message', 'Payment proof approved successfully.'
    );
  END IF;

  RAISE EXCEPTION 'Invalid action parameter.';
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
