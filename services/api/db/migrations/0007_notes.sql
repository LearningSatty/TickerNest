-- Notes feature: simple note-taking with todo-style done marking

CREATE TABLE note (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT '',
  content     text NOT NULL DEFAULT '',
  is_done     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_note_user ON note(user_id);
CREATE INDEX idx_note_user_done ON note(user_id, is_done);

CREATE TRIGGER trg_note_updated BEFORE UPDATE ON note
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();

ALTER TABLE note ENABLE ROW LEVEL SECURITY;
CREATE POLICY note_self ON note
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
