-- Create private storage bucket for scorecard photos (max 5 MB, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scorecards',
  'scorecards',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/heic','image/webp','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Users can upload their own scorecards
CREATE POLICY "scorecards_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'scorecards' AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can read their own scorecards; service role reads all (for signed URL generation)
CREATE POLICY "scorecards_read_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'scorecards' AND auth.uid()::text = (storage.foldername(name))[1]
  );
