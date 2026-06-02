-- Simple Watchlist v2 — flat watchlist → optional group → items.
-- Drops the requirement that every watchlist_item belong to a subsection.
-- Adds: group_name on watchlist_item (NULL = ungrouped).
-- Keeps the old `subsection` table around so existing data is preserved.
--
-- Forward-only, idempotent (uses IF EXISTS / IF NOT EXISTS).

BEGIN;

-- 1. Add direct watchlist_id link (was implied via subsection.watchlist_id)
ALTER TABLE watchlist_item
  ADD COLUMN IF NOT EXISTS watchlist_id uuid REFERENCES watchlist(id) ON DELETE CASCADE;

-- 2. Add group_name (free-text bucket inside a watchlist; NULL = "Ungrouped")
ALTER TABLE watchlist_item
  ADD COLUMN IF NOT EXISTS group_name text;

-- 3. Backfill watchlist_id from existing subsection rows (one-time)
UPDATE watchlist_item wi
   SET watchlist_id = s.watchlist_id
  FROM subsection s
 WHERE wi.subsection_id = s.id
   AND wi.watchlist_id IS NULL;

-- 4. Now require watchlist_id (every item must belong to a watchlist)
ALTER TABLE watchlist_item
  ALTER COLUMN watchlist_id SET NOT NULL;

-- 5. Make subsection_id optional (simple-flow items don't use subsections)
ALTER TABLE watchlist_item
  ALTER COLUMN subsection_id DROP NOT NULL;

-- 6. Drop the old (subsection_id, ticker) UNIQUE — replaced with (watchlist_id, ticker)
--    so a ticker is unique per watchlist regardless of grouping.
ALTER TABLE watchlist_item
  DROP CONSTRAINT IF EXISTS watchlist_item_subsection_id_ticker_key;

-- 7. New uniqueness: one row per (watchlist, ticker)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'watchlist_item_watchlist_id_ticker_key'
  ) THEN
    ALTER TABLE watchlist_item
      ADD CONSTRAINT watchlist_item_watchlist_id_ticker_key
      UNIQUE (watchlist_id, ticker);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wlitem_watchlist
  ON watchlist_item(watchlist_id, position);

COMMIT;
