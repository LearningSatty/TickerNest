import { Pool } from 'pg';

const DDL = `
SET search_path TO mf, public;

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

-- MF schema
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

-- RLS
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mf_fund_user ON mf.mutual_fund(user_id);
CREATE INDEX IF NOT EXISTS idx_mf_tx_fund ON mf.mf_transaction(fund_id);
CREATE INDEX IF NOT EXISTS idx_mf_sip_user ON mf.sip_plan(user_id);
CREATE INDEX IF NOT EXISTS idx_mf_nav_scheme ON mf.mf_nav_history(scheme_code, date DESC);
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
