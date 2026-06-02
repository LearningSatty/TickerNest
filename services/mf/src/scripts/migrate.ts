import { Pool } from 'pg';

const DDL = `
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mutual_fund (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
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

CREATE TABLE IF NOT EXISTS mf_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  fund_id UUID NOT NULL REFERENCES mutual_fund(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','SWITCH_IN','SWITCH_OUT','STP_IN','STP_OUT','DIVIDEND')),
  units NUMERIC(20,6) NOT NULL,
  nav NUMERIC(20,4) NOT NULL,
  amount NUMERIC(20,4) NOT NULL,
  transacted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sip_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  fund_id UUID REFERENCES mutual_fund(id),
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

CREATE TABLE IF NOT EXISTS ulip (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
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

CREATE TABLE IF NOT EXISTS mf_nav_history (
  scheme_code TEXT NOT NULL,
  date DATE NOT NULL,
  nav NUMERIC(20,4) NOT NULL,
  PRIMARY KEY (scheme_code, date)
);

CREATE TABLE IF NOT EXISTS idempotency_record (
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  endpoint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- RLS
ALTER TABLE mutual_fund ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_funds') THEN
    CREATE POLICY user_funds ON mutual_fund USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE mf_transaction ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_mf_tx') THEN
    CREATE POLICY user_mf_tx ON mf_transaction USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE sip_plan ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_sip') THEN
    CREATE POLICY user_sip ON sip_plan USING (user_id = auth.uid());
  END IF;
END $$;

ALTER TABLE ulip ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_ulip') THEN
    CREATE POLICY user_ulip ON ulip USING (user_id = auth.uid());
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mf_user ON mutual_fund(user_id);
CREATE INDEX IF NOT EXISTS idx_mf_tx_fund ON mf_transaction(fund_id);
CREATE INDEX IF NOT EXISTS idx_sip_user ON sip_plan(user_id);
CREATE INDEX IF NOT EXISTS idx_nav_scheme ON mf_nav_history(scheme_code, date DESC);
`;

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    console.log('Running migration for tickernest-mf...');
    await pool.query(DDL);
    console.log('Migration complete: tickernest-mf');
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
