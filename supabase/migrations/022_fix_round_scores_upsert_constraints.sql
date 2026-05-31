-- Replace partial unique indexes with regular unique constraints so Supabase
-- upsert onConflict can find an arbiter. PostgreSQL treats NULLs as distinct
-- in unique constraints, so multiple guest rows (user_id IS NULL) still work.
DROP INDEX IF EXISTS round_scores_member_unique;
DROP INDEX IF EXISTS round_scores_guest_unique;

ALTER TABLE round_scores
  ADD CONSTRAINT round_scores_member_unique UNIQUE (tee_time_id, user_id);

ALTER TABLE round_scores
  ADD CONSTRAINT round_scores_guest_unique UNIQUE (tee_time_id, guest_invite_id);
