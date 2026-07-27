-- Results are always publicly viewable by their unguessable share-link UUID.
-- The /share/[id] page no longer gates on is_shareable; make the column reflect that:
-- default new rounds to shareable and backfill every existing round.
ALTER TABLE tee_times ALTER COLUMN is_shareable SET DEFAULT true;
UPDATE tee_times SET is_shareable = true WHERE is_shareable = false;
