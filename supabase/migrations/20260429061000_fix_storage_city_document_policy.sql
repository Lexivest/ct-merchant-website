-- Keep city-scoped private document reads explicit. The first hardening pass
-- used an unqualified `name` inside a shops subquery; this helper avoids column
-- shadowing and keeps storage policy expressions small.

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

REVOKE ALL ON FUNCTION private.ctm_staff_can_read_private_storage_object(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ctm_staff_can_read_private_storage_object(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_staff_can_read_private_storage_object(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.ctm_staff_can_read_private_storage_object(
  p_bucket_id text,
  p_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, private
AS $$
  SELECT private.ctm_staff_can_read_private_storage_object(p_bucket_id, p_name);
$$;

REVOKE ALL ON FUNCTION public.ctm_staff_can_read_private_storage_object(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_staff_can_read_private_storage_object(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_staff_can_read_private_storage_object(text, text) TO service_role;

DROP POLICY IF EXISTS "CTM private asset read" ON storage.objects;

CREATE POLICY "CTM private asset read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id IN ('id-documents', 'cac-documents', 'kyc_videos', 'kyc-videos', 'payment-receipts')
  AND (
    public.ctm_storage_object_owned_by_current_user(bucket_id, name)
    OR public.ctm_staff_can_read_private_storage_object(bucket_id, name)
  )
);
