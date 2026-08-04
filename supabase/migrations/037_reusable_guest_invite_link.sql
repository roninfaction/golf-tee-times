-- Make a guest invite link REUSABLE: one link fills every open spot instead of
-- dying after the first person claims it.
--
-- Old model: the /fill/<token> link was bound 1:1 to a single guest_invites row.
-- accept_guest_invite() flipped THAT row to 'accepted' AND expired every other
-- pending invite for the tee time. accept-as-member marked it 'expired'. Either
-- way the link was consumed after one fill, forcing the host to generate a new
-- link per guest.
--
-- New model: the token row is a durable "share link" template that stays
-- 'pending' for the life of the tee time. Each acceptance INSERTS a new
-- 'accepted' guest_invites row and leaves the template untouched, so the same
-- link keeps working until the tee time is full (and reopens if a spot frees up).

-- ── Accept a guest via the shared link — creates a new accepted record ────────
CREATE OR REPLACE FUNCTION accept_guest_invite(p_token TEXT, p_name TEXT, p_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_invite     guest_invites%ROWTYPE;
  v_tee_time   tee_times%ROWTYPE;
  v_accepted   INTEGER;
BEGIN
  -- Look up the share-link template by token (do NOT lock/mutate it).
  SELECT * INTO v_invite FROM guest_invites WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN '{"error":"not_found"}'::JSONB;
  END IF;

  -- Lock the tee time row so concurrent accepts can't oversell the spots.
  SELECT * INTO v_tee_time FROM tee_times WHERE id = v_invite.tee_time_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN '{"error":"not_found"}'::JSONB;
  END IF;

  -- Idempotency: if this email already accepted for this tee time, don't take a
  -- second spot — just report success (handles a guest re-opening the link).
  IF p_email IS NOT NULL AND p_email <> '' AND EXISTS (
    SELECT 1 FROM guest_invites
    WHERE tee_time_id = v_invite.tee_time_id
      AND status = 'accepted'
      AND lower(guest_email) = lower(p_email)
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'teeTimeId', v_invite.tee_time_id::TEXT,
      'courseName', v_tee_time.course_name,
      'teeDate', v_tee_time.tee_datetime::TEXT
    );
  END IF;

  -- Count spots already taken (accepted members + accepted guests).
  SELECT
    (SELECT COUNT(*) FROM rsvps WHERE tee_time_id = v_tee_time.id AND status = 'accepted') +
    (SELECT COUNT(*) FROM guest_invites WHERE tee_time_id = v_tee_time.id AND status = 'accepted')
  INTO v_accepted;

  IF v_tee_time.max_players - v_accepted <= 0 THEN
    RETURN '{"error":"no_spots"}'::JSONB;
  END IF;

  -- Create a NEW accepted guest record. The template row stays 'pending' so the
  -- link remains live for the next person.
  INSERT INTO guest_invites (tee_time_id, invited_by, invitee_name, status, accepted_name, accepted_at, guest_email)
  VALUES (v_invite.tee_time_id, v_invite.invited_by, p_name, 'accepted', p_name, now(), NULLIF(p_email, ''));

  RETURN jsonb_build_object(
    'ok', true,
    'teeTimeId', v_invite.tee_time_id::TEXT,
    'courseName', v_tee_time.course_name,
    'teeDate', v_tee_time.tee_datetime::TEXT
  );
END;
$$;

-- ── Create (or reuse) the share link for a tee time ──────────────────────────
-- Returns the existing pending template if one exists so repeated clicks / page
-- reloads always yield the SAME durable link instead of piling up new ones.
DROP FUNCTION IF EXISTS check_and_create_guest_invite(uuid, uuid, text);

CREATE FUNCTION check_and_create_guest_invite(
  p_tee_time_id  UUID,
  p_invited_by   UUID,
  p_invitee_name TEXT DEFAULT NULL
)
RETURNS TABLE(invite_id UUID, invite_token TEXT, err TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_players     INT;
  v_accepted_group  INT;
  v_accepted_guests INT;
  v_open_spots      INT;
  v_invite_id       UUID;
  v_token           TEXT;
BEGIN
  -- Lock the tee time row for the duration of this transaction.
  SELECT max_players INTO v_max_players
  FROM tee_times
  WHERE id = p_tee_time_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'not_found'::TEXT;
    RETURN;
  END IF;

  -- Reuse an existing durable share link if one is already live for this tee time.
  SELECT id, token INTO v_invite_id, v_token
  FROM guest_invites
  WHERE tee_time_id = p_tee_time_id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_invite_id, v_token, NULL::TEXT;
    RETURN;
  END IF;

  -- No live link yet — only mint one if there's a spot to fill.
  SELECT COUNT(*) INTO v_accepted_group
  FROM rsvps
  WHERE tee_time_id = p_tee_time_id AND status = 'accepted';

  SELECT COUNT(*) INTO v_accepted_guests
  FROM guest_invites
  WHERE tee_time_id = p_tee_time_id AND status = 'accepted';

  v_open_spots := v_max_players - v_accepted_group - v_accepted_guests;

  IF v_open_spots <= 0 THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'no_spots'::TEXT;
    RETURN;
  END IF;

  INSERT INTO guest_invites (tee_time_id, invited_by, invitee_name)
  VALUES (p_tee_time_id, p_invited_by, p_invitee_name)
  RETURNING id, token INTO v_invite_id, v_token;

  RETURN QUERY SELECT v_invite_id, v_token, NULL::TEXT;
END;
$$;
