-- Add a protected retention cleanup function for analytics data older than
-- one year. This includes the new unified event stream and legacy view/click
-- tables that are no longer needed for current analytics reporting.

CREATE OR REPLACE FUNCTION public.ctm_purge_old_shop_analytics_data(
  p_keep_days integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_keep_days integer := GREATEST(COALESCE(p_keep_days, 365), 30);
  v_cutoff timestamp with time zone := now() - make_interval(days => v_keep_days);
  v_deleted_event_rows integer := 0;
  v_deleted_shop_view_rows integer := 0;
  v_deleted_whatsapp_rows integer := 0;
BEGIN
  IF NOT (SELECT public.ctm_has_super_staff_access()) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.shop_analytics_events
  WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_deleted_event_rows = ROW_COUNT;

  DELETE FROM public.shop_views
  WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_deleted_shop_view_rows = ROW_COUNT;

  DELETE FROM public.whatsapp_clicks
  WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_deleted_whatsapp_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'keep_days', v_keep_days,
    'cutoff', v_cutoff,
    'deleted_shop_analytics_events', v_deleted_event_rows,
    'deleted_shop_views', v_deleted_shop_view_rows,
    'deleted_whatsapp_clicks', v_deleted_whatsapp_rows,
    'total_deleted',
      COALESCE(v_deleted_event_rows, 0)
      + COALESCE(v_deleted_shop_view_rows, 0)
      + COALESCE(v_deleted_whatsapp_rows, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ctm_purge_old_shop_analytics_data(integer) TO authenticated;
