-- Allow 'OTHER' market on watchlists for exchanges beyond India/US.
-- When market='OTHER', the user provides a custom symbol/prefix (e.g. "TYO",
-- "HKG", "LON") stored in `market_symbol`.

BEGIN;

-- 1. Drop existing CHECK constraint (Postgres doesn't allow ALTER CHECK inline)
ALTER TABLE watchlist DROP CONSTRAINT IF EXISTS watchlist_market_check;

-- 2. Add the expanded constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'watchlist_market_check'
  ) THEN
    ALTER TABLE watchlist
      ADD CONSTRAINT watchlist_market_check CHECK (market IN ('IN', 'US', 'OTHER'));
  END IF;
END $$;

-- 3. Add market_symbol column (only required when market='OTHER')
ALTER TABLE watchlist
  ADD COLUMN IF NOT EXISTS market_symbol text;

-- 4. Ensure market_symbol is provided when market='OTHER'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'watchlist_market_symbol_required'
  ) THEN
    ALTER TABLE watchlist
      ADD CONSTRAINT watchlist_market_symbol_required
      CHECK (market != 'OTHER' OR market_symbol IS NOT NULL);
  END IF;
END $$;

COMMIT;
