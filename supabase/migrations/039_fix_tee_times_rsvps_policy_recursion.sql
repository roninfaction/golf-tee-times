-- 039_fix_tee_times_rsvps_policy_recursion.sql
-- APPLIED 2026-09-08. Fixes `42P17 infinite recursion detected in policy for relation
-- "tee_times"`, which made ANY select on tee_times under a user JWT fail outright.
--
-- The cycle:
--   tee_times_own_or_invited (SELECT) sub-queries rsvps
--   rsvps_group_read         (SELECT) sub-queries tee_times
-- Each subquery re-enters the other table's RLS, forever.
--
-- Inherited from the schema copied when GolfPack split out of close-curtain on 2026-05-24;
-- the abandoned copy had the identical bug. Masked in production only because the app reads
-- through the service role, which bypasses RLS -- meaning RLS was NOT the real security
-- boundary on these two tables. Fixed ahead of public launch.
--
-- Fix: move each membership test into a SECURITY DEFINER helper. A definer function runs as
-- the owner, so its internal reads do not re-trigger RLS and the cycle cannot form. Same
-- pattern the codebase already uses for is_group_member().
--
-- Semantics UNCHANGED -- each helper is the original EXISTS clause verbatim. Verified by
-- computing per-user ground truth with RLS bypassed BEFORE the change, then simulating each
-- of the 8 real sessions after: all 8 match exactly, anon sees 0 of both.
--   (Note when re-checking: rsvps also has the permissive `rsvps_own_write` policy, so a
--    user's visible rsvps are group-visible OR their own. Forgetting that OR looks like a
--    mismatch when it is not.)
--
-- Neither helper leaks: both are scoped to auth.uid() and answer only about the caller.
-- search_path pinned. EXECUTE granted to anon as well as authenticated because these
-- policies are declared TO public, so anon evaluates them -- without the grant an anonymous
-- read 500s instead of returning zero rows.

CREATE OR REPLACE FUNCTION public.has_rsvp_on_tee_time(p_tee_time_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM rsvps r WHERE r.tee_time_id = p_tee_time_id AND r.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_member_of_tee_time_group(p_tee_time_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tee_times tt
    JOIN group_members gm ON gm.group_id = tt.group_id
    WHERE tt.id = p_tee_time_id AND gm.user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_rsvp_on_tee_time(uuid)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_member_of_tee_time_group(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_rsvp_on_tee_time(uuid)        TO anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_member_of_tee_time_group(uuid) TO anon, authenticated, service_role;

ALTER POLICY tee_times_own_or_invited ON public.tee_times
  USING (created_by = auth.uid() OR public.has_rsvp_on_tee_time(id));

ALTER POLICY rsvps_group_read ON public.rsvps
  USING (public.is_member_of_tee_time_group(tee_time_id));
