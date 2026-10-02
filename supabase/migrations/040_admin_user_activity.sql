-- 040_admin_user_activity.sql
-- Per-user activity for the admin Users page and dashboard.
--
-- last_seen comes from auth.sessions, not auth.users.last_sign_in_at. People stay logged in
-- to the PWA, so last_sign_in_at goes months stale on daily users (Tyson read May 25 while
-- using the app on Oct 1). A session's refreshed_at moves every time the app is opened and
-- the access token renews, which is the real "last opened" signal. Signing out deletes the
-- session row, so last_sign_in_at is kept as the floor.
--
-- rsvps_answered counts accepted/declined only: inviting a group upserts a 'pending' rsvp for
-- every member, so raw rsvp counts and rsvps.updated_at move without the member doing anything.
--
-- SECURITY DEFINER because PostgREST cannot read the auth schema. service_role only: it returns
-- every user's email-adjacent activity, so anon and authenticated must not be able to call it.
-- Supabase grants EXECUTE on new public functions to anon/authenticated by default, hence the
-- explicit revokes.

CREATE OR REPLACE FUNCTION public.admin_user_activity()
RETURNS TABLE (
  user_id uuid,
  last_seen timestamptz,
  tee_times_created bigint,
  rsvps_answered bigint,
  rounds_scored bigint,
  group_names text,
  push_on boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.id,
    GREATEST(
      (SELECT max(GREATEST(s.refreshed_at, s.updated_at, s.created_at)) FROM auth.sessions s WHERE s.user_id = u.id),
      u.last_sign_in_at
    ),
    (SELECT count(*) FROM public.tee_times t WHERE t.created_by = u.id),
    (SELECT count(*) FROM public.rsvps r WHERE r.user_id = u.id AND r.status IN ('accepted', 'declined')),
    (SELECT count(*) FROM public.round_scores rs WHERE rs.user_id = u.id),
    (SELECT string_agg(g.name, ', ' ORDER BY g.name) FROM public.group_members gm JOIN public.groups g ON g.id = gm.group_id WHERE gm.user_id = u.id),
    p.push_subscription IS NOT NULL
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_user_activity() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_user_activity() TO service_role;
