CREATE OR REPLACE FUNCTION public.push_user_notification(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_kind text DEFAULT 'system',
  p_action_path text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_notification_id bigint;
  v_title text := left(coalesce(nullif(trim(p_title), ''), 'CTMerchant Update'), 120);
  v_message text := left(coalesce(nullif(trim(p_message), ''), 'There is a new update on your account.'), 1000);
  v_kind text := lower(coalesce(nullif(trim(p_kind), ''), 'system'));
  v_action_path text := nullif(trim(coalesce(p_action_path, '')), '');
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Notification user is required.';
  END IF;

  SELECT n.id
  INTO v_notification_id
  FROM public.notifications n
  WHERE n.user_id = p_user_id
    AND coalesce(n.kind, 'system') = v_kind
    AND n.title = v_title
    AND n.message = v_message
    AND coalesce(n.action_path, '') = coalesce(v_action_path, '')
    AND n.created_at >= now() - interval '10 minutes'
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT 1;

  IF v_notification_id IS NOT NULL THEN
    RETURN v_notification_id;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    kind,
    action_path
  )
  VALUES (
    p_user_id,
    v_title,
    v_message,
    v_kind,
    v_action_path
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

WITH ranked_notifications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        user_id,
        coalesce(kind, 'system'),
        title,
        message,
        coalesce(action_path, ''),
        date_trunc('minute', created_at)
      ORDER BY
        CASE WHEN coalesce(is_read, false) THEN 1 ELSE 0 END,
        created_at DESC,
        id DESC
    ) AS row_rank
  FROM public.notifications
)
DELETE FROM public.notifications n
USING ranked_notifications r
WHERE n.id = r.id
  AND r.row_rank > 1;
