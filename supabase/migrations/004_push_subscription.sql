-- ────────────────────────────────────────────────────────────────────────────
-- 004 · Add push_subscription column to profiles
-- Run in: Supabase Dashboard → SQL Editor
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_subscription JSONB;
