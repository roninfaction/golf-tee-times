-- ────────────────────────────────────────────────────────────────────────────
-- 001 · Initial Schema
-- Run in: Supabase Dashboard → SQL Editor
-- ────────────────────────────────────────────────────────────────────────────

-- profiles: one row per Supabase auth user
CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  display_name        TEXT NOT NULL DEFAULT '',
  email               TEXT NOT NULL DEFAULT '',
  forwarder_token     TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
  onesignal_player_id TEXT
);

-- groups: a named group (typically one per friend circle)
CREATE TABLE IF NOT EXISTS groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  name        TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex')
);

-- group_members: many-to-many users <> groups
CREATE TABLE IF NOT EXISTS group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(group_id, user_id)
);

-- tee_times: the core scheduling record
CREATE TABLE IF NOT EXISTS tee_times (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  group_id            UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  course_name         TEXT NOT NULL,
  tee_datetime        TIMESTAMPTZ NOT NULL,
  holes               INTEGER NOT NULL DEFAULT 18 CHECK (holes IN (9, 18)),
  max_players         INTEGER NOT NULL DEFAULT 4,
  notes               TEXT,
  confirmation_number TEXT,
  source              TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'email_parse')),
  raw_email_body      TEXT,
  reminder_24h_sent   BOOLEAN NOT NULL DEFAULT false,
  reminder_2h_sent    BOOLEAN NOT NULL DEFAULT false
);

-- rsvps: per-user response to a tee time (group members only)
CREATE TABLE IF NOT EXISTS rsvps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  tee_time_id   UUID REFERENCES tee_times(id) ON DELETE CASCADE NOT NULL,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  UNIQUE(tee_time_id, user_id)
);

-- guest_invites: tokenized invite links for outside players (no account required)
CREATE TABLE IF NOT EXISTS guest_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  tee_time_id   UUID REFERENCES tee_times(id) ON DELETE CASCADE NOT NULL,
  invited_by    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  token         TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
  invitee_name  TEXT,
  accepted_name TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  accepted_at   TIMESTAMPTZ
);

-- ── Postgres function for atomic guest invite acceptance ──────────────────────
-- Uses SELECT FOR UPDATE to guarantee first-wins with concurrent requests.
CREATE OR REPLACE FUNCTION accept_guest_invite(p_token TEXT, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_invite      guest_invites%ROWTYPE;
  v_tee_time    tee_times%ROWTYPE;
  v_accepted    INTEGER;
  v_open_spots  INTEGER;
BEGIN
  -- Lock the specific invite row
  SELECT * INTO v_invite FROM guest_invites WHERE token = p_token FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '{"error":"not_found"}'::JSONB;
  END IF;

  IF v_invite.status <> 'pending' THEN
    RETURN '{"error":"already_claimed"}'::JSONB;
  END IF;

  -- Get the tee time to check max_players
  SELECT * INTO v_tee_time FROM tee_times WHERE id = v_invite.tee_time_id;

  -- Count already accepted spots (group members + guests)
  SELECT
    (SELECT COUNT(*) FROM rsvps WHERE tee_time_id = v_tee_time.id AND status = 'accepted') +
    (SELECT COUNT(*) FROM guest_invites WHERE tee_time_id = v_tee_time.id AND status = 'accepted')
  INTO v_accepted;

  v_open_spots := v_tee_time.max_players - v_accepted;

  IF v_open_spots <= 0 THEN
    RETURN '{"error":"no_spots"}'::JSONB;
  END IF;

  -- Claim the spot
  UPDATE guest_invites
  SET status = 'accepted', accepted_name = p_name, accepted_at = now()
  WHERE id = v_invite.id;

  -- Expire all other pending invites for this tee time
  UPDATE guest_invites
  SET status = 'expired'
  WHERE tee_time_id = v_invite.tee_time_id
    AND status = 'pending'
    AND id <> v_invite.id;

  RETURN jsonb_build_object(
    'ok', true,
    'teeTimeId', v_invite.tee_time_id::TEXT,
    'courseName', v_tee_time.course_name,
    'teeDate', v_tee_time.tee_datetime::TEXT
  );
END;
$$;
