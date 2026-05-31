-- Allow recording scores for guests (guest_invites without user accounts).
-- Creator posts on behalf of guests; user_id becomes nullable.

ALTER TABLE round_scores ADD COLUMN IF NOT EXISTS guest_invite_id UUID REFERENCES guest_invites(id) ON DELETE CASCADE;
ALTER TABLE round_scores ALTER COLUMN user_id DROP NOT NULL;

-- Either user_id or guest_invite_id must be set
ALTER TABLE round_scores ADD CONSTRAINT round_scores_player_check
  CHECK (user_id IS NOT NULL OR guest_invite_id IS NOT NULL);

-- Replace the single unique constraint with two partial unique indexes
ALTER TABLE round_scores DROP CONSTRAINT IF EXISTS round_scores_tee_time_id_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS round_scores_member_unique
  ON round_scores(tee_time_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS round_scores_guest_unique
  ON round_scores(tee_time_id, guest_invite_id)
  WHERE guest_invite_id IS NOT NULL;

-- Creator can insert/update/delete guest scores
CREATE POLICY "scores_creator_write_guests" ON round_scores
  FOR ALL USING (
    guest_invite_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM tee_times WHERE id = round_scores.tee_time_id AND created_by = auth.uid()
    )
  );
