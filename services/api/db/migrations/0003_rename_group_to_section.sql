-- Rename watchlist_item.group_name → section_name to match the UI vocab
-- ("Section" is the term users see in the dropdown).  Preserves data.
-- Forward-only.

BEGIN;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'watchlist_item' AND column_name = 'group_name'
  ) THEN
    ALTER TABLE watchlist_item RENAME COLUMN group_name TO section_name;
  END IF;
END $$;

COMMIT;
