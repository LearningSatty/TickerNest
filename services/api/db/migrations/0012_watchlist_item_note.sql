-- Add a short note/reason field to watchlist items.
-- e.g. "Q3 results beat expectations" or "Breakout above 200 DMA"

BEGIN;

ALTER TABLE watchlist_item
  ADD COLUMN IF NOT EXISTS note text;

COMMIT;
