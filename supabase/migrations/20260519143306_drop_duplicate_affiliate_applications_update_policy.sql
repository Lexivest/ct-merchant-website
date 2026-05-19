-- Migration: drop_duplicate_affiliate_applications_update_policy
-- The previous migration (20260518174543) created "Staff can update affiliate
-- applications" using the old get_admin_role() function, which left a
-- policy backed by a public function instead of the hardened private helper.
-- This migration replaces it with a policy using ctm_has_staff_access().

DROP POLICY IF EXISTS "Staff can update affiliate applications" ON public.affiliate_applications;

CREATE POLICY "Allow staff to update affiliate applications"
  ON public.affiliate_applications
  FOR UPDATE
  TO authenticated
  USING ((SELECT ctm_has_staff_access()))
  WITH CHECK ((SELECT ctm_has_staff_access()));
