-- Watchlist groups — fold watchlists themselves into named buckets.
-- A watchlist may belong to at most one group; group_id NULL = ungrouped.
-- Forward-only, idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS watchlist_group (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_group_user
  ON watchlist_group(user_id, position);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_watchlist_group_updated'
  ) THEN
    CREATE TRIGGER trg_watchlist_group_updated BEFORE UPDATE ON watchlist_group
      FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
  END IF;
END $$;

ALTER TABLE watchlist_group ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'watchlist_group'
       AND policyname = 'watchlist_group_owner'
  ) THEN
    CREATE POLICY watchlist_group_owner ON watchlist_group
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Add the optional group_id link on watchlist itself.
ALTER TABLE watchlist
  ADD COLUMN IF NOT EXISTS group_id uuid
  REFERENCES watchlist_group(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_watchlist_group_id
  ON watchlist(group_id);

COMMIT;
