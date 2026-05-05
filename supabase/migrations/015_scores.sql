-- Round scores: total score per round per player (not hole-by-hole).
-- net_score is computed server-side (gross − handicap_used).
-- scorecard_image_url: optional Supabase Storage URL of the uploaded scorecard photo.

CREATE TABLE IF NOT EXISTS round_scores (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  tee_time_id          UUID NOT NULL REFERENCES tee_times(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gross_score          INTEGER NOT NULL CHECK (gross_score > 0 AND gross_score < 200),
  handicap_used        NUMERIC(4,1),
  net_score            INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN handicap_used IS NULL THEN gross_score
      ELSE gross_score - handicap_used::integer
    END
  ) STORED,
  scorecard_image_url  TEXT,
  source               TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'photo_ocr')),
  notes                TEXT,
  UNIQUE(tee_time_id, user_id)
);

ALTER TABLE round_scores ENABLE ROW LEVEL SECURITY;

-- Group members can read scores for tee times in their groups
CREATE POLICY "scores_group_read" ON round_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tee_times tt
      JOIN group_members gm ON gm.group_id = tt.group_id
      WHERE tt.id = round_scores.tee_time_id AND gm.user_id = auth.uid()
    )
  );

-- Users can create/update/delete their own scores
CREATE POLICY "scores_own_write" ON round_scores
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_round_scores_tee_time ON round_scores(tee_time_id);
CREATE INDEX IF NOT EXISTS idx_round_scores_user     ON round_scores(user_id);
