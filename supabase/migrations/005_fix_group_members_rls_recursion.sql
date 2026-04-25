-- Fix infinite recursion in group_members RLS policy.
-- The original "group_members_read" policy queried group_members inside itself,
-- causing infinite recursion whenever any policy on another table (e.g. profiles)
-- queried group_members to check visibility.
--
-- Fix: replace the self-referential subquery with a SECURITY DEFINER function
-- that bypasses RLS, breaking the recursion.

CREATE OR REPLACE FUNCTION is_group_member(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "group_members_read" ON group_members;
CREATE POLICY "group_members_read" ON group_members FOR SELECT USING (
  is_group_member(group_members.group_id)
);
