-- Add merchant-level proof rows to the city-admin commission summary.
-- The original commission migration is already applied remotely, so this
-- follow-up only replaces the summary RPC with the payment breakdown payload.

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
      coalesce(jsonb_agg(payment ORDER BY paid_at DESC), '[]'::jsonb) AS payments,
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
