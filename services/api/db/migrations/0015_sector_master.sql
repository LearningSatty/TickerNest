-- Sector and Sector-Domain master tables (global, shared across all users).
-- Used as dropdown options when assigning sector/domain to holdings.

BEGIN;

CREATE TABLE IF NOT EXISTS sector (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sector_domain (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Add sector_id and sector_domain_id to holding for structured references
ALTER TABLE holding
  ADD COLUMN IF NOT EXISTS sector_id uuid REFERENCES sector(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sector_domain_id uuid REFERENCES sector_domain(id) ON DELETE SET NULL;

COMMIT;
