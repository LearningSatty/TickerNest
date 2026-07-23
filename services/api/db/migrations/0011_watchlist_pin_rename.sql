-- Add pinning + description support to watchlists.
-- Pinned watchlists always appear at the top of their group, in pin order.

BEGIN;

ALTER TABLE watchlist
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE watchlist
  ADD COLUMN IF NOT EXISTS description text;

COMMIT;
