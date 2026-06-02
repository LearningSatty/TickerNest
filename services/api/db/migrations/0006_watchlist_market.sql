-- Add `market` to watchlists so the per-watchlist add-ticker form can
-- default the market filter (Indian vs US).  NOT NULL with default IN
-- so existing rows pick up a sane value.

BEGIN;

ALTER TABLE watchlist
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'IN'
  CHECK (market IN ('IN', 'US'));

COMMIT;
