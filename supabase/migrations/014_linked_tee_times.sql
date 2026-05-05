-- Linked tee times: multiple back-to-back slots for the same round.
-- parent_tee_time_id links sibling slots together (the first slot is its own parent's NULL).
-- slot_order controls display ordering within a linked set.

ALTER TABLE tee_times ADD COLUMN IF NOT EXISTS parent_tee_time_id UUID REFERENCES tee_times(id) ON DELETE SET NULL;
ALTER TABLE tee_times ADD COLUMN IF NOT EXISTS slot_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_tee_times_parent ON tee_times(parent_tee_time_id);
