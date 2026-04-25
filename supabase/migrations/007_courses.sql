-- Golf courses table — populated on first selection via Google Places API
CREATE TABLE courses (
  place_id  TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  address   TEXT,
  phone     TEXT,
  website   TEXT,
  maps_url  TEXT,
  lat       DOUBLE PRECISION,
  lng       DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read courses
CREATE POLICY "courses_select" ON courses
  FOR SELECT TO authenticated USING (true);

-- Only service role can insert/update (done server-side)
-- (no INSERT/UPDATE policy = blocked for anon/authenticated, allowed for service_role)

-- Link tee_times to a course record (nullable — manual entries may not have one)
ALTER TABLE tee_times ADD COLUMN course_place_id TEXT REFERENCES courses(place_id);
