import { Pool } from 'pg';

const DDL = `
-- NOTE: On Supabase, auth.uid() already exists (provided by Supabase Auth).
-- We do NOT create the auth schema or the uid() function.

-- Shared user table (public schema)
CREATE TABLE IF NOT EXISTS public.app_user (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHEMA: mf (Mutual Funds service)
-- ============================================================
CREATE SCHEMA IF NOT EXISTS mf;

CREATE TABLE IF NOT EXISTS mf.mutual_fund (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  scheme_code TEXT NOT NULL,
  fund_name TEXT NOT NULL,
  amc TEXT,
  category TEXT CHECK (category IN ('EQUITY','DEBT','HYBRID','ELSS','LIQUID','INDEX','OTHER')),
  goal TEXT,
  units NUMERIC(20,6) NOT NULL DEFAULT 0,
  avg_nav NUMERIC(20,4) NOT NULL DEFAULT 0,
  current_nav NUMERIC(20,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, scheme_code)
);

CREATE TABLE IF NOT EXISTS mf.mf_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  fund_id UUID NOT NULL REFERENCES mf.mutual_fund(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','SWITCH_IN','SWITCH_OUT','STP_IN','STP_OUT','DIVIDEND')),
  units NUMERIC(20,6) NOT NULL,
  nav NUMERIC(20,4) NOT NULL,
  amount NUMERIC(20,4) NOT NULL,
  transacted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mf.sip_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  fund_id UUID REFERENCES mf.mutual_fund(id),
  fund_name TEXT NOT NULL,
  scheme_code TEXT,
  amount NUMERIC(20,4) NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (frequency IN ('MONTHLY','WEEKLY','QUARTERLY')),
  sip_date INT CHECK (sip_date BETWEEN 1 AND 28),
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','COMPLETED','CANCELLED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mf.ulip (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  insurer TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  policy_number TEXT,
  premium NUMERIC(20,4) NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'YEARLY',
  fund_value NUMERIC(20,4),
  maturity_date DATE,
  nominee TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mf.mf_nav_history (
  scheme_code TEXT NOT NULL,
  date DATE NOT NULL,
  nav NUMERIC(20,4) NOT NULL,
  PRIMARY KEY (scheme_code, date)
);

CREATE TABLE IF NOT EXISTS mf.idempotency_record (
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  endpoint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- MF RLS
ALTER TABLE mf.mutual_fund ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'mf' AND policyname = 'user_funds') THEN
    CREATE POLICY user_funds ON mf.mutual_fund USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE mf.mf_transaction ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'mf' AND policyname = 'user_mf_tx') THEN
    CREATE POLICY user_mf_tx ON mf.mf_transaction USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE mf.sip_plan ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'mf' AND policyname = 'user_sip') THEN
    CREATE POLICY user_sip ON mf.sip_plan USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE mf.ulip ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'mf' AND policyname = 'user_ulip') THEN
    CREATE POLICY user_ulip ON mf.ulip USING (user_id = auth.uid());
  END IF;
END $$;

-- MF Indexes
CREATE INDEX IF NOT EXISTS idx_mf_fund_user ON mf.mutual_fund(user_id);
CREATE INDEX IF NOT EXISTS idx_mf_tx_fund ON mf.mf_transaction(fund_id);
CREATE INDEX IF NOT EXISTS idx_mf_sip_user ON mf.sip_plan(user_id);
CREATE INDEX IF NOT EXISTS idx_mf_nav_scheme ON mf.mf_nav_history(scheme_code, date DESC);

-- ============================================================
-- SCHEMA: intl (International / Crypto service)
-- ============================================================
CREATE SCHEMA IF NOT EXISTS intl;

CREATE TABLE IF NOT EXISTS intl.us_holding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  ticker TEXT NOT NULL,
  name TEXT,
  sector TEXT,
  qty NUMERIC(20,6) NOT NULL,
  avg_cost_usd NUMERIC(20,4) NOT NULL,
  lot_kind TEXT NOT NULL DEFAULT 'OPEN_MARKET' CHECK (lot_kind IN ('OPEN_MARKET','ESPP','RSU','BONUS')),
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
  purchase_frequency TEXT DEFAULT 'QUARTERLY',
  next_purchase_date DATE,
  contribution_pct NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intl.fx_rate (
  pair TEXT NOT NULL,
  date DATE NOT NULL,
  rate NUMERIC(12,4) NOT NULL,
  source TEXT DEFAULT 'exchangerate.host',
  PRIMARY KEY (pair, date)
);

CREATE TABLE IF NOT EXISTS intl.crypto_holding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  coin TEXT NOT NULL,
  name TEXT,
  qty NUMERIC(20,8) NOT NULL,
  avg_cost_inr NUMERIC(20,4) NOT NULL,
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

-- Intl RLS
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

-- Intl Indexes
CREATE INDEX IF NOT EXISTS idx_intl_us_user ON intl.us_holding(user_id);
CREATE INDEX IF NOT EXISTS idx_intl_us_tx_holding ON intl.us_transaction(holding_id);
CREATE INDEX IF NOT EXISTS idx_intl_crypto_user ON intl.crypto_holding(user_id);
CREATE INDEX IF NOT EXISTS idx_intl_fx_pair ON intl.fx_rate(pair, date DESC);

-- ============================================================
-- SCHEMA: physical (Gold + Manual Assets service)
-- ============================================================
CREATE SCHEMA IF NOT EXISTS physical;

CREATE TABLE IF NOT EXISTS physical.gold_holding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_user(id),
  type TEXT NOT NULL CHECK (type IN ('PHYSICAL','DIGITAL')),
  weight_grams NUMERIC(12,4) NOT NULL,
  purity INT NOT NULL CHECK (purity IN (999, 995, 958, 916, 750, 585)),
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
  coupon_rate NUMERIC(5,2) NOT NULL DEFAULT 2.5,
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
  invested NUMERIC(20,4) NOT NULL DEFAULT 0,
  current_value NUMERIC(20,4) NOT NULL DEFAULT 0,
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
  date DATE NOT NULL PRIMARY KEY,
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

-- Physical RLS
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

-- Physical Indexes
CREATE INDEX IF NOT EXISTS idx_phys_gold_user ON physical.gold_holding(user_id);
CREATE INDEX IF NOT EXISTS idx_phys_sgb_user ON physical.sgb_holding(user_id);
CREATE INDEX IF NOT EXISTS idx_phys_asset_user ON physical.manual_asset(user_id);
CREATE INDEX IF NOT EXISTS idx_phys_event_asset ON physical.manual_asset_event(asset_id);
`;

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    console.log('Running combined migration for tickernest-services...');
    await pool.query(DDL);
    console.log('Migration complete: all schemas (mf, intl, physical) created successfully');
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
