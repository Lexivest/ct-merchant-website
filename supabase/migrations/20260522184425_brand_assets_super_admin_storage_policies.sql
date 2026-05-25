-- Create brand-assets storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-assets',
  'brand-assets',
  true,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Owner-scoped policies (authenticated users managing their own brand assets)
CREATE POLICY "Brand Assets - Public Read"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'brand-assets'
    AND ctm_storage_object_owned_by_current_user(bucket_id, name)
  );

CREATE POLICY "Brand Assets - Insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND ctm_storage_object_owned_by_current_user(bucket_id, name)
  );

CREATE POLICY "Brand Assets - Update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND ctm_storage_object_owned_by_current_user(bucket_id, name)
  );

CREATE POLICY "Brand Assets - Delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND ctm_storage_object_owned_by_current_user(bucket_id, name)
  );

-- Super-admin override policies (full access for super staff)
CREATE POLICY "Brand Assets - Super Admin Read"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'brand-assets'
    AND ctm_has_super_staff_access()
  );

CREATE POLICY "Brand Assets - Super Admin Insert"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND ctm_has_super_staff_access()
  );

CREATE POLICY "Brand Assets - Super Admin Update"
  ON storage.objects FOR UPDATE
  TO public
  USING (
    bucket_id = 'brand-assets'
    AND ctm_has_super_staff_access()
  )
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND ctm_has_super_staff_access()
  );

CREATE POLICY "Brand Assets - Super Admin Delete"
  ON storage.objects FOR DELETE
  TO public
  USING (
    bucket_id = 'brand-assets'
    AND ctm_has_super_staff_access()
  );
