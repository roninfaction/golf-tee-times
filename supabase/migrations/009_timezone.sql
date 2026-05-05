-- Add timezone support to groups and profiles
-- groups.timezone = group default (e.g. "America/Los_Angeles")
-- profiles.timezone = personal override (NULL = use group timezone)

ALTER TABLE groups ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT;
