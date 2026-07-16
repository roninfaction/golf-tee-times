-- Fix: group cover photo uploads fail with "new row violates row-level security policy".
--
-- The group-photos bucket has RLS enabled but ZERO policies on the new project, so every
-- upload is denied. This broke on 2026-05-24 (5ab197a) when the DB moved to project
-- aqcyuxxvgbyifdnhfzoq: the bucket row was recreated but its storage.objects policies
-- were never carried over. Last successful upload was 2026-05-03, on the old project.
--
-- It went unnoticed for ~7 weeks because groups.photo_url still points at the OLD
-- project's public CDN (drnbwzzzlbxpcymnwxmv), which is still serving the image — so the
-- photo displays fine and only *changing* it fails.
--
-- Policy scope: any group member, matching the pre-migration behaviour (several members
-- had changed the cover). Uses the SECURITY DEFINER is_group_member() helper so the
-- subquery does not re-enter group_members RLS (see 005_fix_group_members_rls_recursion).
--
-- The uuid regex guard runs before the ::uuid cast so a junk path is denied by RLS rather
-- than raising a cast error.
--
-- SELECT is required, not optional: GroupPhotoUpload uses upsert:true, which is
-- INSERT ... ON CONFLICT DO UPDATE and must read the conflicting row. Same root cause as
-- the avatars bug in 032.

DROP POLICY IF EXISTS "group_photos_read_own_groups" ON storage.objects;
DROP POLICY IF EXISTS "group_photos_upload" ON storage.objects;
DROP POLICY IF EXISTS "group_photos_update" ON storage.objects;

CREATE POLICY "group_photos_read_own_groups" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'group-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_group_member(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "group_photos_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'group-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_group_member(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "group_photos_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'group-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_group_member(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'group-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_group_member(((storage.foldername(name))[1])::uuid)
  );
