-- ────────────────────────────────────────────────────────────────────────────
-- 003 · Indexes & Triggers
-- ────────────────────────────────────────────────────────────────────────────

-- Indexes
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

-- updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tee_times_updated_at
  BEFORE UPDATE ON tee_times
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rsvps_updated_at
  BEFORE UPDATE ON rsvps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on new user signup
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
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
