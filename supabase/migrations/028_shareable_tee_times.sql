-- Controls whether round results are publicly accessible via /share/[id]
ALTER TABLE tee_times ADD COLUMN IF NOT EXISTS is_shareable BOOLEAN NOT NULL DEFAULT false;
