-- Team play: assign players to named teams within a tee time.
-- Supports formats: stroke, scramble, best_ball, stableford, match_play

-- Teams within a single tee time
CREATE TABLE IF NOT EXISTS tee_time_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_time_id UUID NOT NULL REFERENCES tee_times(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Team A',
  color       TEXT          -- hex color for UI distinction e.g. "#30D158"
);

CREATE INDEX IF NOT EXISTS idx_tee_time_teams_tee_time ON tee_time_teams(tee_time_id);

ALTER TABLE tee_time_teams ENABLE ROW LEVEL SECURITY;

-- Group members can read and manage teams for tee times in their groups
CREATE POLICY "teams_group_read" ON tee_time_teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tee_times tt
      JOIN group_members gm ON gm.group_id = tt.group_id
      WHERE tt.id = tee_time_teams.tee_time_id AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "teams_creator_write" ON tee_time_teams
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tee_times WHERE id = tee_time_teams.tee_time_id AND created_by = auth.uid()
    )
  );

-- Link each RSVP to a team
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES tee_time_teams(id) ON DELETE SET NULL;

-- Format of play stored on the tee time itself
ALTER TABLE tee_times ADD COLUMN IF NOT EXISTS format TEXT
  CHECK (format IN ('stroke', 'scramble', 'best_ball', 'stableford', 'match_play'));
