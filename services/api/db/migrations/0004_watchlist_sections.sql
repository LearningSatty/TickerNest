-- Track user-defined sections at the watchlist level so empty sections
-- (created via the dialog before any stock is added) persist.
--
-- Items still reference sections by name via watchlist_item.section_name;
-- we just guarantee the name shows up in the parent watchlist's `sections`
-- array even when no item currently uses it.
--
-- Forward-only, idempotent.

BEGIN;

ALTER TABLE watchlist
  ADD COLUMN IF NOT EXISTS sections text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Backfill existing watchlists: pull distinct section names from current items.
UPDATE watchlist w
   SET sections = sub.names
  FROM (
    SELECT watchlist_id,
           ARRAY(SELECT DISTINCT section_name
                   FROM watchlist_item
                  WHERE watchlist_id = wl.watchlist_id
                    AND section_name IS NOT NULL
                  ORDER BY section_name) AS names
      FROM (SELECT DISTINCT watchlist_id FROM watchlist_item) wl
  ) sub
 WHERE w.id = sub.watchlist_id
   AND COALESCE(array_length(w.sections, 1), 0) = 0;

COMMIT;
