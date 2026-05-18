-- The storage RLS wrapper is only needed by authenticated storage policies.
REVOKE ALL ON FUNCTION public.ctm_staff_can_read_private_storage_object(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctm_staff_can_read_private_storage_object(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ctm_staff_can_read_private_storage_object(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_staff_can_read_private_storage_object(text, text) TO service_role;
