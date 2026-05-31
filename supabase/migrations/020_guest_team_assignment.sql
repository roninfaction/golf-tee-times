-- Allow guests to be assigned to teams within a tee time
ALTER TABLE guest_invites ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES tee_time_teams(id) ON DELETE SET NULL;
