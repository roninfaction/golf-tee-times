-- Super admin flag for app-owner-level access (Matt only).
-- Set is_super_admin = true manually via Supabase dashboard for your user ID.
-- All /api/admin/* routes require this flag.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;
