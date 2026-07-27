-- App-level invites: "come use GolfPack and run your own crew".
-- Distinct from group invites (groups.invite_code → join MY group as member)
-- and guest invites (guest_invites.token → RSVP one tee time, no account).
-- An app invite lands a brand-new user in signup, then forces them into
-- creating their OWN group where they are admin. Fully isolated from the inviter.

CREATE TABLE app_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  inviter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(9), 'hex'),
  invitee_name TEXT
);

CREATE INDEX idx_app_invites_inviter ON app_invites(inviter_id);

-- All reads/writes go through the service client in API routes / server
-- components, which bypasses RLS. Lock the table to anon/authenticated.
ALTER TABLE app_invites ENABLE ROW LEVEL SECURITY;

-- Referral attribution: who invited this user to the app. Nullable; set once
-- (on invite accept) and never overwritten. Isolated from group membership.
ALTER TABLE profiles ADD COLUMN invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
