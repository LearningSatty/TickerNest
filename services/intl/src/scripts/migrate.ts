import { Pool } from 'pg';

const DDL = `
SET search_path TO intl, public;

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

-- Intl schema
CREATE SCHEMA IF NOT EXISTS intl;

CREATE TABLE IF NOT EXISTS intl.us_holding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  ticker TEXT NOT NULL,
  name TEXT,
  sector TEXT,
  qty NUMERIC(20,6) NOT NULL DEFAULT 0,
  avg_cost_usd NUMERIC(20,4) NOT NULL DEFAULT 0,
  lot_kind TEXT NOT NULL CHECK (lot_kind IN ('OPEN_MARKET','ESPP','RSU','BONUS')),
  broker_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker, lot_kind, broker_name)
);

CREATE TABLE IF NOT EXISTS intl.us_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  holding_id UUID NOT NULL REFERENCES intl.us_holding(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','VEST','DIVIDEND')),
  qty NUMERIC(20,6) NOT NULL,
  price_usd NUMERIC(20,4) NOT NULL,
  fx_rate NUMERIC(12,4),
  fees_usd NUMERIC(20,4) DEFAULT 0,
  transacted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intl.espp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  company TEXT NOT NULL,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 15,
  purchase_frequency TEXT NOT NULL DEFAULT 'QUARTERLY',
  next_purchase_date DATE,
  contribution_pct NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intl.fx_rate (
  pair TEXT NOT NULL,
  date DATE NOT NULL,
  rate NUMERIC(12,4) NOT NULL,
  source TEXT,
  PRIMARY KEY (pair, date)
);

CREATE TABLE IF NOT EXISTS intl.crypto_holding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  coin TEXT NOT NULL,
  name TEXT,
  qty NUMERIC(20,8) NOT NULL DEFAULT 0,
  avg_cost_inr NUMERIC(20,4) NOT NULL DEFAULT 0,
  platform TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, coin, platform)
);

CREATE TABLE IF NOT EXISTS intl.crypto_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  holding_id UUID NOT NULL REFERENCES intl.crypto_holding(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','SWAP','REWARD','AIRDROP')),
  qty NUMERIC(20,8) NOT NULL,
  price_inr NUMERIC(20,4) NOT NULL,
  fees_inr NUMERIC(20,4) DEFAULT 0,
  transacted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intl.idempotency_record (
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  endpoint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- RLS
ALTER TABLE intl.us_holding ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'intl' AND policyname = 'user_us') THEN
    CREATE POLICY user_us ON intl.us_holding USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE intl.us_transaction ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'intl' AND policyname = 'user_us_tx') THEN
    CREATE POLICY user_us_tx ON intl.us_transaction USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE intl.espp_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'intl' AND policyname = 'user_espp') THEN
    CREATE POLICY user_espp ON intl.espp_config USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE intl.crypto_holding ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'intl' AND policyname = 'user_crypto') THEN
    CREATE POLICY user_crypto ON intl.crypto_holding USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE intl.crypto_transaction ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'intl' AND policyname = 'user_crypto_tx') THEN
    CREATE POLICY user_crypto_tx ON intl.crypto_transaction USING (user_id = auth.uid());
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intl_us_user ON intl.us_holding(user_id);
CREATE INDEX IF NOT EXISTS idx_intl_us_tx_holding ON intl.us_transaction(holding_id);
CREATE INDEX IF NOT EXISTS idx_intl_espp_user ON intl.espp_config(user_id);
CREATE INDEX IF NOT EXISTS idx_intl_fx_pair ON intl.fx_rate(pair, date DESC);
CREATE INDEX IF NOT EXISTS idx_intl_crypto_user ON intl.crypto_holding(user_id);
CREATE INDEX IF NOT EXISTS idx_intl_crypto_tx_holding ON intl.crypto_transaction(holding_id);
`;

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    console.log('Running migration for tickernest-intl...');
    await pool.query(DDL);
    console.log('Migration complete: tickernest-intl');
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
