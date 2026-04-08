-- ============================================================
-- TeeUp — Complete Database Setup
-- Paste this entire file into:
-- https://supabase.com/dashboard/project/drnbwzzzlbxpcymnwxmv/sql
-- Then click "Run"
-- ============================================================


-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  display_name        TEXT NOT NULL DEFAULT '',
  email               TEXT NOT NULL DEFAULT '',
  forwarder_token     TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
  onesignal_player_id TEXT
);

CREATE TABLE IF NOT EXISTS groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  name        TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex')
);

CREATE TABLE IF NOT EXISTS group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS tee_times (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  group_id            UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  course_name         TEXT NOT NULL,
  tee_datetime        TIMESTAMPTZ NOT NULL,
  holes               INTEGER NOT NULL DEFAULT 18 CHECK (holes IN (9, 18)),
  max_players         INTEGER NOT NULL DEFAULT 4,
  notes               TEXT,
  confirmation_number TEXT,
  source              TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'email_parse')),
  raw_email_body      TEXT,
  reminder_24h_sent   BOOLEAN NOT NULL DEFAULT false,
  reminder_2h_sent    BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS rsvps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  tee_time_id   UUID REFERENCES tee_times(id) ON DELETE CASCADE NOT NULL,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  UNIQUE(tee_time_id, user_id)
);

CREATE TABLE IF NOT EXISTS guest_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  tee_time_id   UUID REFERENCES tee_times(id) ON DELETE CASCADE NOT NULL,
  invited_by    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  token         TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
  invitee_name  TEXT,
  accepted_name TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  accepted_at   TIMESTAMPTZ
);


-- ── 2. Guest invite atomic function ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION accept_guest_invite(p_token TEXT, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_invite      guest_invites%ROWTYPE;
  v_tee_time    tee_times%ROWTYPE;
  v_accepted    INTEGER;
  v_open_spots  INTEGER;
BEGIN
  SELECT * INTO v_invite FROM guest_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN '{"error":"not_found"}'::JSONB;
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN '{"error":"already_claimed"}'::JSONB;
  END IF;
  SELECT * INTO v_tee_time FROM tee_times WHERE id = v_invite.tee_time_id;
  SELECT
    (SELECT COUNT(*) FROM rsvps WHERE tee_time_id = v_tee_time.id AND status = 'accepted') +
    (SELECT COUNT(*) FROM guest_invites WHERE tee_time_id = v_tee_time.id AND status = 'accepted')
  INTO v_accepted;
  v_open_spots := v_tee_time.max_players - v_accepted;
  IF v_open_spots <= 0 THEN
    RETURN '{"error":"no_spots"}'::JSONB;
  END IF;
  UPDATE guest_invites
    SET status = 'accepted', accepted_name = p_name, accepted_at = now()
    WHERE id = v_invite.id;
  UPDATE guest_invites
    SET status = 'expired'
    WHERE tee_time_id = v_invite.tee_time_id AND status = 'pending' AND id <> v_invite.id;
  RETURN jsonb_build_object(
    'ok', true,
    'teeTimeId', v_invite.tee_time_id::TEXT,
    'courseName', v_tee_time.course_name,
    'teeDate', v_tee_time.tee_datetime::TEXT
  );
END;
$$;


-- ── 3. Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tee_times     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_own" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "profiles_group_read" ON profiles FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM group_members gm1
    JOIN group_members gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = auth.uid() AND gm2.user_id = profiles.id
  )
);

CREATE POLICY "groups_members_read" ON groups FOR SELECT USING (
  EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())
);
CREATE POLICY "groups_admin_write" ON groups FOR ALL USING (
  EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY "groups_invite_read" ON groups FOR SELECT USING (true);

CREATE POLICY "group_members_read" ON group_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid())
);
CREATE POLICY "group_members_self_insert" ON group_members FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "group_members_admin_delete" ON group_members FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
  )
);

CREATE POLICY "tee_times_group_read" ON tee_times FOR SELECT USING (
  EXISTS (SELECT 1 FROM group_members WHERE group_id = tee_times.group_id AND user_id = auth.uid())
);
CREATE POLICY "tee_times_group_insert" ON tee_times FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM group_members WHERE group_id = tee_times.group_id AND user_id = auth.uid())
);
CREATE POLICY "tee_times_creator_or_admin_modify" ON tee_times FOR UPDATE USING (
  created_by = auth.uid() OR
  EXISTS (SELECT 1 FROM group_members WHERE group_id = tee_times.group_id AND user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY "tee_times_creator_or_admin_delete" ON tee_times FOR DELETE USING (
  created_by = auth.uid() OR
  EXISTS (SELECT 1 FROM group_members WHERE group_id = tee_times.group_id AND user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "rsvps_group_read" ON rsvps FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM tee_times tt
    JOIN group_members gm ON gm.group_id = tt.group_id
    WHERE tt.id = rsvps.tee_time_id AND gm.user_id = auth.uid()
  )
);
CREATE POLICY "rsvps_own_write" ON rsvps FOR ALL USING (user_id = auth.uid());

CREATE POLICY "guest_invites_group_read" ON guest_invites FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM tee_times tt
    JOIN group_members gm ON gm.group_id = tt.group_id
    WHERE tt.id = guest_invites.tee_time_id AND gm.user_id = auth.uid()
  )
);
CREATE POLICY "guest_invites_group_insert" ON guest_invites FOR INSERT WITH CHECK (
  invited_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM tee_times tt
    JOIN group_members gm ON gm.group_id = tt.group_id
    WHERE tt.id = guest_invites.tee_time_id AND gm.user_id = auth.uid()
  )
);


-- ── 4. Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_group_members_user_id  ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_tee_times_group_id     ON tee_times(group_id);
CREATE INDEX IF NOT EXISTS idx_tee_times_datetime     ON tee_times(tee_datetime);
CREATE INDEX IF NOT EXISTS idx_tee_times_reminders    ON tee_times(tee_datetime, reminder_24h_sent, reminder_2h_sent);
CREATE INDEX IF NOT EXISTS idx_rsvps_tee_time_id      ON rsvps(tee_time_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user_id          ON rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_guest_invites_token    ON guest_invites(token);
CREATE INDEX IF NOT EXISTS idx_guest_invites_tee_time ON guest_invites(tee_time_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_forwarder_token ON profiles(forwarder_token);


-- ── 5. Triggers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tee_times_updated_at
  BEFORE UPDATE ON tee_times FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER rsvps_updated_at
  BEFORE UPDATE ON rsvps FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(split_part(NEW.email, '@', 1), 'Golfer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── Done! ──────────────────────────────────────────────────────────────────────
-- You should see: "Success. No rows returned"
