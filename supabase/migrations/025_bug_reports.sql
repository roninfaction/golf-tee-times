CREATE TABLE bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name TEXT,
  user_email TEXT,
  title TEXT NOT NULL,
  description TEXT,
  screenshot_path TEXT,
  page_url TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated users can submit reports
CREATE POLICY "bug_reports_insert" ON bug_reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only super admins can read all reports
CREATE POLICY "bug_reports_select_admin" ON bug_reports
  FOR SELECT USING (
    (SELECT is_super_admin FROM profiles WHERE id = auth.uid())
  );

-- Only super admins can update (status, admin_notes)
CREATE POLICY "bug_reports_update_admin" ON bug_reports
  FOR UPDATE USING (
    (SELECT is_super_admin FROM profiles WHERE id = auth.uid())
  );

CREATE INDEX bug_reports_status_idx ON bug_reports(status);
CREATE INDEX bug_reports_created_at_idx ON bug_reports(created_at DESC);
