-- Organizations: country clubs and other entities that contain multiple groups.
-- A standalone friend group has org_id = NULL.

CREATE TABLE IF NOT EXISTS organizations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  name           TEXT NOT NULL,
  slug           TEXT UNIQUE,
  logo_url       TEXT,
  invite_code    TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  billing_status TEXT NOT NULL DEFAULT 'trial'
);

-- Link groups to an org (nullable = standalone friend group)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_groups_org_id ON groups(org_id);

-- Org membership (separate from group membership)
CREATE TABLE IF NOT EXISTS org_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id  ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);
