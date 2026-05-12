-- Fix Supabase security lint warnings:
-- 1. affiliate_applications INSERT policy WITH CHECK always true
-- 2. affiliate_applications UPDATE policy USING+WITH CHECK always true
-- 3. sync_shop_coordinates_from_kyc_meta accessible by anon+authenticated
-- 4. cleanup_orphaned_product_images accessible by authenticated

-- ── affiliate_applications RLS ────────────────────────────────────────────────

-- Drop the overly-permissive policies created outside migrations
DROP POLICY IF EXISTS "Allow affiliate application submissions" ON public.affiliate_applications;
DROP POLICY IF EXISTS "Allow authenticated users to update affiliate applications" ON public.affiliate_applications;

-- Proper INSERT for anon: only allowed if they don't claim a user_id
CREATE POLICY "Anon affiliate application submissions"
  ON public.affiliate_applications
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- Authenticated INSERT is already scoped in baseline as
-- "Users can submit their own affiliate applications" (user_id = auth.uid() OR NULL).
-- Recreate it here in case it was overwritten.
DROP POLICY IF EXISTS "Users can submit their own affiliate applications" ON public.affiliate_applications;
CREATE POLICY "Users can submit their own affiliate applications"
  ON public.affiliate_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) OR user_id IS NULL);

-- UPDATE only for staff; merchants cannot modify their own application after submission
DROP POLICY IF EXISTS "Staff can update affiliate applications" ON public.affiliate_applications;
CREATE POLICY "Staff can update affiliate applications"
  ON public.affiliate_applications
  FOR UPDATE
  TO authenticated
  USING (get_admin_role() IS NOT NULL)
  WITH CHECK (get_admin_role() IS NOT NULL);

-- ── SECURITY DEFINER function exposure ───────────────────────────────────────

-- sync_shop_coordinates_from_kyc_meta is a trigger function; no role should
-- call it directly via RPC.  Explicit revokes cover any individual grants
-- that survive a REVOKE … FROM PUBLIC.
REVOKE EXECUTE ON FUNCTION public.sync_shop_coordinates_from_kyc_meta() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_shop_coordinates_from_kyc_meta() FROM authenticated;

-- cleanup_orphaned_product_images is also a trigger function.  The earlier
-- migration granted authenticated unnecessarily; revoke it.
REVOKE EXECUTE ON FUNCTION public.cleanup_orphaned_product_images() FROM authenticated;
