import { Pool } from 'pg';

const DDL = `
SET search_path TO physical, public;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Shared user table (public schema, idempotent)
CREATE TABLE IF NOT EXISTS public.app_user (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Physical schema
CREATE SCHEMA IF NOT EXISTS physical;

CREATE TABLE IF NOT EXISTS physical.gold_holding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  type TEXT NOT NULL CHECK (type IN ('PHYSICAL','DIGITAL')),
  weight_grams NUMERIC(12,4) NOT NULL,
  purity INT NOT NULL CHECK (purity IN (999,995,958,916,750,585)),
  purchase_price_per_gram NUMERIC(20,4) NOT NULL,
  purchase_date DATE,
  storage_location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS physical.sgb_holding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  series_name TEXT NOT NULL,
  units NUMERIC(12,4) NOT NULL,
  purchase_nav NUMERIC(20,4) NOT NULL,
  purchase_date DATE NOT NULL,
  maturity_date DATE NOT NULL,
  coupon_rate NUMERIC(5,2) DEFAULT 2.5,
  broker TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS physical.manual_asset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  type TEXT NOT NULL CHECK (type IN ('PPF','EPF','NPS','FD','RD','INSURANCE','REAL_ESTATE','OTHER')),
  name TEXT NOT NULL,
  institution TEXT,
  invested NUMERIC(20,4) DEFAULT 0,
  current_value NUMERIC(20,4) DEFAULT 0,
  interest_rate NUMERIC(5,2),
  maturity_date DATE,
  nominee TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS physical.manual_asset_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  asset_id UUID NOT NULL REFERENCES physical.manual_asset(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAWAL','INTEREST','MATURITY','PREMIUM')),
  amount NUMERIC(20,4) NOT NULL,
  event_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS physical.gold_rate_history (
  date DATE PRIMARY KEY,
  rate_24k_per_gram NUMERIC(20,4) NOT NULL,
  rate_22k_per_gram NUMERIC(20,4),
  source TEXT DEFAULT 'IBJA'
);

CREATE TABLE IF NOT EXISTS physical.idempotency_record (
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  endpoint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- RLS
ALTER TABLE physical.gold_holding ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'physical' AND policyname = 'user_gold') THEN
    CREATE POLICY user_gold ON physical.gold_holding USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE physical.sgb_holding ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'physical' AND policyname = 'user_sgb') THEN
    CREATE POLICY user_sgb ON physical.sgb_holding USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE physical.manual_asset ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'physical' AND policyname = 'user_asset') THEN
    CREATE POLICY user_asset ON physical.manual_asset USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE physical.manual_asset_event ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'physical' AND policyname = 'user_event') THEN
    CREATE POLICY user_event ON physical.manual_asset_event USING (user_id = auth.uid());
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_phys_gold_user ON physical.gold_holding(user_id);
CREATE INDEX IF NOT EXISTS idx_phys_sgb_user ON physical.sgb_holding(user_id);
CREATE INDEX IF NOT EXISTS idx_phys_asset_user ON physical.manual_asset(user_id);
CREATE INDEX IF NOT EXISTS idx_phys_event_asset ON physical.manual_asset_event(asset_id);
CREATE INDEX IF NOT EXISTS idx_phys_gold_rate_date ON physical.gold_rate_history(date DESC);
`;

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    console.log('Running migration for tickernest-physical...');
    await pool.query(DDL);
    console.log('Migration complete: tickernest-physical');
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
