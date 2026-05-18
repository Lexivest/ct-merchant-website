-- 1. Aggressively clear the old function to resolve "cannot change return type" errors.
-- CASCADE is used because other dashboard functions might reference this signature.
DROP FUNCTION IF EXISTS public.ctm_get_security_radar_insights() CASCADE;

-- 2. Re-create the function with the fixed clustering logic.
CREATE OR REPLACE FUNCTION public.ctm_get_security_radar_insights()
 RETURNS TABLE(
  fingerprint_type text, 
  fingerprint_value text, 
  occurrence_count bigint, 
  associated_emails text[], 
  associated_shops text[], 
  is_banned boolean, 
  risk_level text, 
  account_data jsonb
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Authorization check
  IF NOT public.is_staff_member() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH all_registrations AS (
    -- Collect registration fingerprints from both Profiles and Shops
    -- Profiles
    SELECT 
      u.id as user_id,
      u.email, 
      p.creation_ip, 
      p.creation_device, 
      NULL::text as shop_name,
      p.full_name
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (p.creation_ip IS NOT NULL AND p.creation_ip <> 'Unknown IP' AND length(p.creation_ip) > 6)
       OR (p.creation_device IS NOT NULL AND p.creation_device <> 'Unknown Device')
    
    UNION ALL

    -- Shops
    SELECT 
      u.id as user_id,
      u.email, 
      s.creation_ip, 
      s.creation_device, 
      s.name as shop_name,
      NULL::text as full_name
    FROM public.shops s
    LEFT JOIN auth.users u ON u.id = s.owner_id
    WHERE (s.creation_ip IS NOT NULL AND s.creation_ip <> 'Unknown IP' AND length(s.creation_ip) > 6)
       OR (s.creation_device IS NOT NULL AND s.creation_device <> 'Unknown Device')
  ),
  ip_clusters AS (
    -- Group by IP Address
    SELECT
      'IP Address'::text as f_type,
      creation_ip as f_value,
      count(*)::bigint as occurrences,
      array_agg(DISTINCT COALESCE(email, 'No Email'))::text[] as emails,
      array_agg(DISTINCT shop_name) FILTER (WHERE shop_name IS NOT NULL)::text[] as shops,
      jsonb_agg(DISTINCT jsonb_build_object(
        'email', COALESCE(email, 'No Email'),
        'name', COALESCE(full_name, 'Unknown'),
        'shops', (SELECT jsonb_agg(name) FROM public.shops WHERE owner_id = all_registrations.user_id)
      )) as data_payload
    FROM all_registrations
    WHERE creation_ip IS NOT NULL AND creation_ip <> 'Unknown IP'
    GROUP BY creation_ip
    HAVING count(*) > 1
  ),
  device_clusters AS (
    -- Group by Device Signature
    SELECT
      'Device Signature'::text as f_type,
      creation_device as f_value,
      count(*)::bigint as occurrences,
      array_agg(DISTINCT COALESCE(email, 'No Email'))::text[] as emails,
      array_agg(DISTINCT shop_name) FILTER (WHERE shop_name IS NOT NULL)::text[] as shops,
      jsonb_agg(DISTINCT jsonb_build_object(
        'email', COALESCE(email, 'No Email'),
        'name', COALESCE(full_name, 'Unknown'),
        'ip', creation_ip,
        'shops', (SELECT jsonb_agg(name) FROM public.shops WHERE owner_id = all_registrations.user_id)
      )) as data_payload
    FROM all_registrations
    WHERE creation_device IS NOT NULL AND creation_device <> 'Unknown Device'
    GROUP BY creation_device
    HAVING count(*) > 1
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
    EXISTS (SELECT 1 FROM public.ip_blacklist bl WHERE bl.ip_address = c.f_value) as is_banned,
    CASE 
      WHEN c.occurrences >= 5 THEN 'CRITICAL'
      WHEN c.occurrences >= 3 THEN 'HIGH'
      ELSE 'MEDIUM'
    END as risk_level,
    c.data_payload as account_data
  FROM combined c
  ORDER BY c.occurrences DESC;
END;
$function$;
