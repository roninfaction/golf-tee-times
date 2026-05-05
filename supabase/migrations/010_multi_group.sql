-- Allow users to belong to multiple groups.
-- Adds active group preference, email forwarding group preference,
-- group capacity (optional), group photo, and per-group tee interval.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_group_id UUID REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS forwarding_group_id UUID REFERENCES groups(id) ON DELETE SET NULL;

-- NULL = no member cap (default for all groups)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS max_members INTEGER;

-- Photo was referenced in app code but never migrated
ALTER TABLE groups ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Default interval between tee times (minutes). Clubs set this once for their course.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS default_tee_interval INTEGER NOT NULL DEFAULT 10;
