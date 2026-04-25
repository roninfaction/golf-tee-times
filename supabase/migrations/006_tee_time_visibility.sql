-- ────────────────────────────────────────────────────────────────────────────
-- 006 · Per-user tee time visibility + profile avatars
-- ────────────────────────────────────────────────────────────────────────────

-- ── tee_times: replace group-wide read with RSVP-based visibility ────────────

DROP POLICY IF EXISTS "tee_times_group_read" ON tee_times;

-- A user can see a tee time if they created it OR have an RSVP row for it.
-- INSERT/UPDATE/DELETE policies from 002 are unchanged.
CREATE POLICY "tee_times_own_or_invited" ON tee_times
  FOR SELECT USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM rsvps
      WHERE rsvps.tee_time_id = tee_times.id
        AND rsvps.user_id = auth.uid()
    )
  );

-- ── profiles: add avatar_url column ─────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
