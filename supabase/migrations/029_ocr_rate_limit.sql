CREATE TABLE ocr_usage_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  called_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ocr_usage_log_user_date ON ocr_usage_log (user_id, called_at);

ALTER TABLE ocr_usage_log ENABLE ROW LEVEL SECURITY;
-- Service client (used in all OCR routes) bypasses RLS; no user-facing policies needed
