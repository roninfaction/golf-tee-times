-- Private bucket for bug report screenshots — only accessible via signed URLs (service client)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-report-screenshots',
  'bug-report-screenshots',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/heic','image/webp','image/heif','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to their own folder: {user_id}/{filename}
CREATE POLICY "bug_screenshots_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'bug-report-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- No public read — admin API uses service client to generate signed URLs
