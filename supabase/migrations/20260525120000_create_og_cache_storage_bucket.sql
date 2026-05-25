-- Public storage bucket for caching generated OG grid images.
-- Files named shop-{id}.png, written by the og-image edge function (service role).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('og-cache', 'og-cache', true, 5242880, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "og-cache public read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'og-cache');

CREATE POLICY "og-cache service insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'og-cache');

CREATE POLICY "og-cache service update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'og-cache')
  WITH CHECK (bucket_id = 'og-cache');
