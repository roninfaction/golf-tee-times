-- Fix: "new row violates row-level security policy" when re-uploading a profile photo.
--
-- Root cause: AvatarUpload writes to a fixed path (<uid>/avatar.jpg) with upsert:true,
-- which is INSERT ... ON CONFLICT DO UPDATE. That statement must read the conflicting
-- row to update it, so it needs a SELECT policy. The original "avatars_read" policy
-- (024) was dropped by hand during the 2026-07-11 hardening to stop bucket enumeration,
-- which silently broke every re-upload: the existing row was invisible, so the upsert
-- could not resolve the conflict and failed the INSERT check.
--
-- First-time uploads still worked (no conflicting row), which is why this looked
-- intermittent rather than broken.
--
-- Fix without reopening the enumeration hole: scope SELECT to the caller's own folder,
-- matching the existing scorecards_read_own pattern. Public avatar reads are unaffected —
-- the bucket is public and served over the CDN path, which does not consult RLS.

DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_read_own" ON storage.objects;

CREATE POLICY "avatars_read_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- avatars_update had USING but no WITH CHECK. Postgres falls back to USING for the new
-- row, so behaviour is already correct; state it explicitly so a future edit to USING
-- cannot accidentally allow writing a row into another user's folder.
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;

CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]
  );
