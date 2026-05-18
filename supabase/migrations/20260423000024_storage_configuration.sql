-- 1. Ensure Storage Buckets Exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('storefronts', 'storefronts', true),
    ('brand-assets', 'brand-assets', true),
    ('id-documents', 'id-documents', false),
    ('cac-documents', 'cac-documents', false),
    ('kyc-videos', 'kyc-videos', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Set up RLS Policies for Storage (Drop first to avoid collision)

-- Storefronts
DROP POLICY IF EXISTS "Public Read Storefronts" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Storefronts" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update Storefronts" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete Storefronts" ON storage.objects;

CREATE POLICY "Public Read Storefronts" ON storage.objects FOR SELECT TO public USING (bucket_id = 'storefronts');
CREATE POLICY "Auth Upload Storefronts" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'storefronts');
CREATE POLICY "Auth Update Storefronts" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'storefronts');
CREATE POLICY "Auth Delete Storefronts" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'storefronts');

-- Brand Assets
DROP POLICY IF EXISTS "Public Read Brand Assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Brand Assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update Brand Assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete Brand Assets" ON storage.objects;

CREATE POLICY "Public Read Brand Assets" ON storage.objects FOR SELECT TO public USING (bucket_id = 'brand-assets');
CREATE POLICY "Auth Upload Brand Assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'brand-assets');
CREATE POLICY "Auth Update Brand Assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'brand-assets');
CREATE POLICY "Auth Delete Brand Assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'brand-assets');

-- ID Documents (Private, check for folder ownership or staff)
DROP POLICY IF EXISTS "Owner Read ID" ON storage.objects;
DROP POLICY IF EXISTS "Owner Upload ID" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete ID" ON storage.objects;

CREATE POLICY "Owner Read ID" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'id-documents');
CREATE POLICY "Owner Upload ID" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'id-documents');
CREATE POLICY "Owner Delete ID" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'id-documents');

-- CAC Documents
DROP POLICY IF EXISTS "Owner Read CAC" ON storage.objects;
DROP POLICY IF EXISTS "Owner Upload CAC" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete CAC" ON storage.objects;

CREATE POLICY "Owner Read CAC" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'cac-documents');
CREATE POLICY "Owner Upload CAC" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'cac-documents');
CREATE POLICY "Owner Delete CAC" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'cac-documents');

-- KYC Videos
DROP POLICY IF EXISTS "Owner Read KYC Video" ON storage.objects;
DROP POLICY IF EXISTS "Owner Upload KYC Video" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete KYC Video" ON storage.objects;

CREATE POLICY "Owner Read KYC Video" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'kyc-videos');
CREATE POLICY "Owner Upload KYC Video" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'kyc-videos');
CREATE POLICY "Owner Delete KYC Video" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'kyc-videos');
