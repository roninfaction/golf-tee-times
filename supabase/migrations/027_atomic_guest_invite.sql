-- Atomically checks available spots and inserts a guest invite in one transaction.
-- Uses SELECT FOR UPDATE on tee_times to prevent concurrent oversell.
CREATE OR REPLACE FUNCTION check_and_create_guest_invite(
  p_tee_time_id  UUID,
  p_invited_by   UUID,
  p_invitee_name TEXT DEFAULT NULL
)
RETURNS TABLE(invite_id UUID, invite_token UUID, err TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_players    INT;
  v_accepted_group INT;
  v_accepted_guests INT;
  v_open_spots     INT;
  v_invite_id      UUID;
  v_token          UUID;
BEGIN
  -- Lock the tee time row for the duration of this transaction
  SELECT max_players INTO v_max_players
  FROM tee_times
  WHERE id = p_tee_time_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, 'not_found'::TEXT;
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
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, 'no_spots'::TEXT;
    RETURN;
  END IF;

  INSERT INTO guest_invites (tee_time_id, invited_by, invitee_name)
  VALUES (p_tee_time_id, p_invited_by, p_invitee_name)
  RETURNING id, token INTO v_invite_id, v_token;

  RETURN QUERY SELECT v_invite_id, v_token, NULL::TEXT;
END;
$$;
