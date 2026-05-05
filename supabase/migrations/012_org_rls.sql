-- RLS policies for organizations and org_members.
-- Uses SECURITY DEFINER helper functions to avoid policy recursion.

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- Helper functions (same pattern as is_group_member from migration 005)
CREATE OR REPLACE FUNCTION is_org_member(p_org_id UUID) RETURNS BOOLEAN
  LANGUAGE sql SECURITY DEFINER STABLE AS
  $$ SELECT EXISTS(SELECT 1 FROM org_members WHERE org_id = p_org_id AND user_id = auth.uid()) $$;

CREATE OR REPLACE FUNCTION is_org_admin(p_org_id UUID) RETURNS BOOLEAN
  LANGUAGE sql SECURITY DEFINER STABLE AS
  $$ SELECT EXISTS(SELECT 1 FROM org_members WHERE org_id = p_org_id AND user_id = auth.uid() AND role IN ('owner','admin')) $$;

-- Organizations
CREATE POLICY "orgs_members_read" ON organizations
  FOR SELECT USING (is_org_member(id));

CREATE POLICY "orgs_admin_write" ON organizations
  FOR UPDATE USING (is_org_admin(id));

CREATE POLICY "orgs_insert_authenticated" ON organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Org members
CREATE POLICY "org_members_read" ON org_members
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "org_members_self_insert" ON org_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "org_members_admin_manage" ON org_members
  FOR DELETE USING (is_org_admin(org_id));

CREATE POLICY "org_members_admin_update" ON org_members
  FOR UPDATE USING (is_org_admin(org_id));
