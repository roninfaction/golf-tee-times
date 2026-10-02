-- 041_games_and_side_bets.sql
-- Games: an optional per-player stake on a round's game. The game itself already lives in
-- tee_times.format + tee_time_teams. NULL = nothing riding on it.
--
-- Side bets: a ledger of who owes whom between two members. A running tab between two people
-- is the sum of their rows (winner is owed, loser owes). Settling up writes an offsetting
-- 'settle' row instead of deleting history. A settled game writes one 'game' row per
-- winner/loser pair, tied to the round so it can be undone.

ALTER TABLE tee_times
  ADD COLUMN IF NOT EXISTS stake_cents INTEGER
  CHECK (stake_cents IS NULL OR (stake_cents > 0 AND stake_cents <= 100000));

CREATE TABLE IF NOT EXISTS side_bets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  winner_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  loser_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 1000000),
  note          TEXT CHECK (note IS NULL OR char_length(note) <= 120),
  kind          TEXT NOT NULL DEFAULT 'bet' CHECK (kind IN ('bet', 'game', 'settle')),
  tee_time_id   UUID REFERENCES tee_times(id) ON DELETE SET NULL,
  CHECK (winner_id <> loser_id)
);

CREATE INDEX IF NOT EXISTS idx_side_bets_winner ON side_bets(winner_id);
CREATE INDEX IF NOT EXISTS idx_side_bets_loser ON side_bets(loser_id);
CREATE INDEX IF NOT EXISTS idx_side_bets_tee_time ON side_bets(tee_time_id);

-- A game can only be settled once: a double tap on "Settle" hits this instead of doubling the tab.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_side_bets_game_pair
  ON side_bets(tee_time_id, winner_id, loser_id) WHERE kind = 'game';

ALTER TABLE side_bets ENABLE ROW LEVEL SECURITY;

-- Only the two people on a bet can see it. Writes go through API routes (service role),
-- which check that both people share a group.
CREATE POLICY "side_bets_party_read" ON side_bets
  FOR SELECT USING (auth.uid() = winner_id OR auth.uid() = loser_id);
