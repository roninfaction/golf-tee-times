-- Fix check_and_create_guest_invite: guest_invites.token is TEXT (24-char hex
-- via gen_random_bytes), but the function declared v_token/invite_token as UUID.
-- The RETURNING ... INTO cast a non-UUID-formatted hex string to uuid and failed
-- with "invalid input syntax for type uuid", breaking every guest invite link.
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
  v_max_players    INT;
  v_accepted_group INT;
  v_accepted_guests INT;
  v_open_spots     INT;
  v_invite_id      UUID;
  v_token          TEXT;
BEGIN
  -- Lock the tee time row for the duration of this transaction
  SELECT max_players INTO v_max_players
  FROM tee_times
  WHERE id = p_tee_time_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'not_found'::TEXT;
    RETURN;
  END IF;

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
