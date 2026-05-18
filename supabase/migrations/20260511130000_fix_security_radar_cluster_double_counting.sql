-- Fix registration cluster double-counting in ctm_get_security_radar_insights.
--
-- Root cause: the previous implementation did a UNION ALL of profiles and shops,
-- so one person who registered an account AND created a shop appeared twice in
-- the same IP / device cluster — once as a profile row and once as a shop row.
-- A cluster of 6 real people each with a shop was reported as count = 12.
-- Additionally, jsonb_agg(DISTINCT ...) could not deduplicate those two rows
-- because they produced slightly different JSON objects (full_name vs null),
-- so the same account appeared twice in the account card display.
--
-- Fix: use a single profiles-only CTE (one row per user). Shop names are
-- collected via a correlated subquery so they still appear in the account card.
-- Counts now use count(DISTINCT user_id) for correctness.

CREATE OR REPLACE FUNCTION private.ctm_get_security_radar_insights()
RETURNS TABLE(
  fingerprint_type  text,
  fingerprint_value text,
  occurrence_count  bigint,
  associated_emails text[],
  associated_shops  text[],
  is_banned         boolean,
  risk_level        text,
  account_data      jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF NOT private.ctm_has_super_staff_access() THEN
    RAISE EXCEPTION 'Super admin access required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  -- One row per user from profiles only.
  -- Shops are fetched via correlated subquery so they appear in the account card
  -- without inflating the cluster occurrence count.
  WITH user_registrations AS (
    SELECT
      u.id          AS user_id,
      u.email,
      p.creation_ip,
      p.creation_device,
      p.full_name
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (p.creation_ip IS NOT NULL
             AND p.creation_ip <> 'Unknown IP'
             AND length(p.creation_ip) > 6)
       OR (p.creation_device IS NOT NULL
             AND p.creation_device <> 'Unknown Device')
  ),
  ip_clusters AS (
    SELECT
      'IP Address'::text                                                AS f_type,
      ur.creation_ip                                                    AS f_value,
      count(DISTINCT ur.user_id)::bigint                                AS occurrences,
      array_agg(DISTINCT COALESCE(ur.email, 'No Email'))::text[]       AS emails,
      (SELECT array_agg(DISTINCT s.name)
       FROM public.shops s
       WHERE s.owner_id IN (
         SELECT ur2.user_id
         FROM user_registrations ur2
         WHERE ur2.creation_ip = ur.creation_ip
           AND ur2.user_id IS NOT NULL
       )
       AND s.name IS NOT NULL
      )                                                                 AS shops,
      jsonb_agg(
        jsonb_build_object(
          'email',  COALESCE(ur.email, 'No Email'),
          'name',   COALESCE(ur.full_name, 'Unknown'),
          'shops',  COALESCE(
                      (SELECT jsonb_agg(s.name ORDER BY s.created_at)
                       FROM public.shops s
                       WHERE s.owner_id = ur.user_id),
                      '[]'::jsonb
                    )
        )
        ORDER BY COALESCE(ur.email, 'No Email')
      )                                                                 AS data_payload
    FROM user_registrations ur
    WHERE ur.creation_ip IS NOT NULL
      AND ur.creation_ip <> 'Unknown IP'
    GROUP BY ur.creation_ip
    HAVING count(DISTINCT ur.user_id) > 1
  ),
  device_clusters AS (
    SELECT
      'Device Signature'::text                                          AS f_type,
      ur.creation_device                                                AS f_value,
      count(DISTINCT ur.user_id)::bigint                                AS occurrences,
      array_agg(DISTINCT COALESCE(ur.email, 'No Email'))::text[]       AS emails,
      (SELECT array_agg(DISTINCT s.name)
       FROM public.shops s
       WHERE s.owner_id IN (
         SELECT ur2.user_id
         FROM user_registrations ur2
         WHERE ur2.creation_device = ur.creation_device
           AND ur2.user_id IS NOT NULL
       )
       AND s.name IS NOT NULL
      )                                                                 AS shops,
      jsonb_agg(
        jsonb_build_object(
          'email',  COALESCE(ur.email, 'No Email'),
          'name',   COALESCE(ur.full_name, 'Unknown'),
          'ip',     ur.creation_ip,
          'shops',  COALESCE(
                      (SELECT jsonb_agg(s.name ORDER BY s.created_at)
                       FROM public.shops s
                       WHERE s.owner_id = ur.user_id),
                      '[]'::jsonb
                    )
        )
        ORDER BY COALESCE(ur.email, 'No Email')
      )                                                                 AS data_payload
    FROM user_registrations ur
    WHERE ur.creation_device IS NOT NULL
      AND ur.creation_device <> 'Unknown Device'
    GROUP BY ur.creation_device
    HAVING count(DISTINCT ur.user_id) > 1
  ),
  combined AS (
    SELECT * FROM ip_clusters
    UNION ALL
    SELECT * FROM device_clusters
  )
  SELECT
    c.f_type,
    c.f_value,
    c.occurrences,
    c.emails,
    c.shops,
    EXISTS (
      SELECT 1 FROM public.ip_blacklist bl
      WHERE bl.ip_address = c.f_value
    )                                                                   AS is_banned,
    CASE
      WHEN c.occurrences >= 5 THEN 'CRITICAL'
      WHEN c.occurrences >= 3 THEN 'HIGH'
      ELSE                          'MEDIUM'
    END                                                                 AS risk_level,
    c.data_payload
  FROM combined c
  ORDER BY c.occurrences DESC;
END;
$$;

REVOKE ALL ON FUNCTION private.ctm_get_security_radar_insights() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ctm_get_security_radar_insights()
  TO authenticated, service_role;
