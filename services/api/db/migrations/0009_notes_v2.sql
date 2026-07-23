-- Notes v2: Folders, rich content, tags, pinning, images

-- Folders for organizing notes
CREATE TABLE note_folder (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name        text NOT NULL,
  parent_id   uuid REFERENCES note_folder(id) ON DELETE CASCADE,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_note_folder_user ON note_folder(user_id);
CREATE TRIGGER trg_note_folder_updated BEFORE UPDATE ON note_folder
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE note_folder ENABLE ROW LEVEL SECURITY;
CREATE POLICY note_folder_self ON note_folder
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Upgrade note table: add folder_id, is_pinned, tags, rich content
ALTER TABLE note ADD COLUMN folder_id uuid REFERENCES note_folder(id) ON DELETE SET NULL;
ALTER TABLE note ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE note ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE note ADD COLUMN content_html text NOT NULL DEFAULT '';
ALTER TABLE note ADD COLUMN has_checklist boolean NOT NULL DEFAULT false;
ALTER TABLE note ADD COLUMN has_table boolean NOT NULL DEFAULT false;
ALTER TABLE note ADD COLUMN has_image boolean NOT NULL DEFAULT false;

CREATE INDEX idx_note_folder ON note(folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX idx_note_pinned ON note(user_id, is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_note_tags ON note USING gin(tags);

-- Note attachments (images)
CREATE TABLE note_attachment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  note_id     uuid NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  filename    text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  int NOT NULL DEFAULT 0,
  url         text NOT NULL,  -- storage URL (Supabase Storage or similar)
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_note_attachment_note ON note_attachment(note_id);
ALTER TABLE note_attachment ENABLE ROW LEVEL SECURITY;
CREATE POLICY note_attachment_self ON note_attachment
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
