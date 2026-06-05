-- ── Create cairo-uploads storage bucket for temp PDF staging ─────────────────
-- Run in Supabase → SQL Editor

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cairo-uploads',
  'cairo-uploads',
  false,                        -- private bucket
  26214400,                     -- 25 MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: authenticated users can upload; service role cleans up
CREATE POLICY "auth users can upload cairo pdfs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'cairo-uploads');

CREATE POLICY "auth users can read own cairo pdfs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'cairo-uploads');

CREATE POLICY "service role can delete cairo pdfs"
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'cairo-uploads');
