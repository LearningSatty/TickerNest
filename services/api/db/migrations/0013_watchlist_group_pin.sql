-- Add pinning support to watchlist groups for ordering in the sidebar.

BEGIN;

ALTER TABLE watchlist_group
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

COMMIT;
