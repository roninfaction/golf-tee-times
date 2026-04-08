-- ────────────────────────────────────────────────────────────────────────────
-- 002 · Row Level Security Policies
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tee_times     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_invites ENABLE ROW LEVEL SECURITY;

-- ── profiles ──────────────────────────────────────────────────────────────────

-- Own row: full access
CREATE POLICY "profiles_own" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Group co-members can read each other's profiles
CREATE POLICY "profiles_group_read" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_members gm1
      JOIN group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid() AND gm2.user_id = profiles.id
    )
  );

-- ── groups ────────────────────────────────────────────────────────────────────

CREATE POLICY "groups_members_read" ON groups
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())
  );

CREATE POLICY "groups_admin_write" ON groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = groups.id AND user_id = auth.uid() AND role = 'admin'
    )
  );

-- Anyone can read a group by invite_code (for the join flow — checked server-side)
CREATE POLICY "groups_invite_read" ON groups
  FOR SELECT USING (true);

-- ── group_members ──────────────────────────────────────────────────────────────

CREATE POLICY "group_members_read" ON group_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
    )
  );

-- Only admins can add/remove members; users can add themselves (join flow)
CREATE POLICY "group_members_self_insert" ON group_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "group_members_admin_delete" ON group_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
  );

-- ── tee_times ──────────────────────────────────────────────────────────────────

CREATE POLICY "tee_times_group_read" ON tee_times
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_id = tee_times.group_id AND user_id = auth.uid())
  );

CREATE POLICY "tee_times_group_insert" ON tee_times
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM group_members WHERE group_id = tee_times.group_id AND user_id = auth.uid())
  );

CREATE POLICY "tee_times_creator_or_admin_modify" ON tee_times
  FOR UPDATE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = tee_times.group_id AND user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "tee_times_creator_or_admin_delete" ON tee_times
  FOR DELETE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = tee_times.group_id AND user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── rsvps ──────────────────────────────────────────────────────────────────────

-- Group members can read all RSVPs for their group's tee times
CREATE POLICY "rsvps_group_read" ON rsvps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tee_times tt
      JOIN group_members gm ON gm.group_id = tt.group_id
      WHERE tt.id = rsvps.tee_time_id AND gm.user_id = auth.uid()
    )
  );

-- Users can upsert their own RSVP
CREATE POLICY "rsvps_own_write" ON rsvps
  FOR ALL USING (user_id = auth.uid());

-- ── guest_invites ──────────────────────────────────────────────────────────────

-- Group members can read guest invites for their tee times
CREATE POLICY "guest_invites_group_read" ON guest_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tee_times tt
      JOIN group_members gm ON gm.group_id = tt.group_id
      WHERE tt.id = guest_invites.tee_time_id AND gm.user_id = auth.uid()
    )
  );

-- Group members can create guest invites for their group's tee times
CREATE POLICY "guest_invites_group_insert" ON guest_invites
  FOR INSERT WITH CHECK (
    invited_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM tee_times tt
      JOIN group_members gm ON gm.group_id = tt.group_id
      WHERE tt.id = guest_invites.tee_time_id AND gm.user_id = auth.uid()
    )
  );

-- NOTE: guest accept (UPDATE) is handled by the accept_guest_invite() function
-- using service role — no RLS policy needed for anonymous updates.
