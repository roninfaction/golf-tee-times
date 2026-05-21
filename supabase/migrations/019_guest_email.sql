-- Add guest_email column for reminder opt-in
ALTER TABLE guest_invites ADD COLUMN IF NOT EXISTS guest_email TEXT;

-- Update accept_guest_invite to accept and store optional email
CREATE OR REPLACE FUNCTION accept_guest_invite(p_token TEXT, p_name TEXT, p_email TEXT DEFAULT NULL)
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
  SET status = 'accepted', accepted_name = p_name, accepted_at = now(), guest_email = p_email
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
