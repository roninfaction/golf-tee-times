-- GHIN handicap integration
-- ghin_number: the user's GHIN ID (stored as text, no leading zeros stripped)
-- ghin_handicap_index: cached handicap, refreshed on demand
-- ghin_last_fetched: timestamp of last successful fetch (NULL = never fetched)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ghin_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ghin_handicap_index NUMERIC(4,1);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ghin_last_fetched TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_ghin ON profiles(ghin_number) WHERE ghin_number IS NOT NULL;
