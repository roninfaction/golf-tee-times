-- Tighten group-photos writes from "any member" (033) to "group admin", matching the API.
--
-- PATCH /api/groups/[id] already refuses photo_url updates from non-admins. 033 left the
-- storage policies at any-member, which is a privilege gap rather than a harmless mismatch:
-- the cover lives at the fixed path <groupId>/cover.<ext> that photo_url already points to,
-- so a non-admin member could overwrite the bytes and change the group's displayed photo
-- without ever calling the admin-only API.
--
-- Read stays at any-member: members need SELECT for the upsert conflict lookup, and the
-- group cover is not sensitive to other members of the same group.

CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = auth.uid() AND role = 'admin'
  )
$function$;

DROP POLICY IF EXISTS "group_photos_upload" ON storage.objects;
DROP POLICY IF EXISTS "group_photos_update" ON storage.objects;

CREATE POLICY "group_photos_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'group-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_group_admin(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "group_photos_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'group-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_group_admin(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'group-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_group_admin(((storage.foldername(name))[1])::uuid)
  );
