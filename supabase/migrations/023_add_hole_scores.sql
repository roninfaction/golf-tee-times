-- Stores per-hole stroke counts for match play calculation.
-- Format: {"1": 4, "2": 5, ..., "18": 3}
ALTER TABLE round_scores ADD COLUMN IF NOT EXISTS hole_scores JSONB;
