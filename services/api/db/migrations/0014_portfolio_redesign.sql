-- Portfolio Redesign: clean-slate broker/holding model with dual-ticker storage,
-- ticker transformation rules, computed columns, and import session tracking.
--
-- ⚠️ DESTRUCTIVE: Drops all existing broker/holding data.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. DROP old tables (dependency order)
-- ═══════════════════════════════════════════════════════════════════════════════
DROP MATERIALIZED VIEW IF EXISTS v_holding_consolidated CASCADE;
DROP TABLE IF EXISTS holding_audit CASCADE;
DROP TABLE IF EXISTS sold_share CASCADE;
DROP TABLE IF EXISTS csv_import CASCADE;
DROP TABLE IF EXISTS excel_import CASCADE;
DROP TABLE IF EXISTS holding CASCADE;
DROP TABLE IF EXISTS broker CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. NEW TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- 2.1 portfolio — top-level container (enables future multi-portfolio)
CREATE TABLE portfolio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'My Portfolio',
  description text,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE portfolio ENABLE ROW LEVEL SECURITY;
CREATE POLICY portfolio_owner ON portfolio USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_portfolio_updated BEFORE UPDATE ON portfolio
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();

-- 2.2 broker — redesigned with exchange_default
CREATE TABLE broker (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  portfolio_id     uuid NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
  name             text NOT NULL,
  display_name     text NOT NULL,
  currency         text NOT NULL DEFAULT 'INR',
  exchange_default text NOT NULL DEFAULT 'NSE',
  sort_order       integer NOT NULL DEFAULT 0,
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, portfolio_id, name)
);
CREATE INDEX idx_broker_user ON broker(user_id) WHERE deleted_at IS NULL;
ALTER TABLE broker ENABLE ROW LEVEL SECURITY;
CREATE POLICY broker_owner ON broker USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_broker_updated BEFORE UPDATE ON broker
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();

-- 2.3 holding — dual-ticker storage
CREATE TABLE holding (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  broker_id       uuid NOT NULL REFERENCES broker(id) ON DELETE CASCADE,
  source_ticker   text NOT NULL,
  resolved_ticker text NOT NULL,
  qty             numeric(20,4) NOT NULL CHECK (qty >= 0),
  avg_cost        numeric(20,4) NOT NULL CHECK (avg_cost >= 0),
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, broker_id, source_ticker)
);
CREATE INDEX idx_holding_resolved ON holding(resolved_ticker);
CREATE INDEX idx_holding_user_active ON holding(user_id) WHERE qty > 0;
CREATE INDEX idx_holding_broker ON holding(broker_id);
ALTER TABLE holding ENABLE ROW LEVEL SECURITY;
CREATE POLICY holding_owner ON holding USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_holding_updated BEFORE UPDATE ON holding
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();

-- 2.4 ticker_transform_rule — per-broker transformation pipeline
CREATE TABLE ticker_transform_rule (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id  uuid NOT NULL REFERENCES broker(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  priority   integer NOT NULL DEFAULT 0,
  kind       text NOT NULL CHECK (kind IN ('UPPERCASE','STRIP_PREFIX','STRIP_SUFFIX','APPEND_SUFFIX','REGEX_REPLACE')),
  config     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_transform_rule_broker ON ticker_transform_rule(broker_id, priority);
ALTER TABLE ticker_transform_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY transform_rule_owner ON ticker_transform_rule USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2.5 ticker_resolution — shared verification cache
CREATE TABLE ticker_resolution (
  resolved_ticker text PRIMARY KEY,
  canonical_name  text,
  exchange        text,
  status          text NOT NULL DEFAULT 'UNVERIFIED' CHECK (status IN ('VERIFIED','UNVERIFIED','FAILED')),
  verified_at     timestamptz
);

-- 2.6 computed_column_def — formula definitions
CREATE TABLE computed_column_def (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES app_user(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  expression  text NOT NULL,
  input_vars  text[] NOT NULL DEFAULT '{}',
  output_type text NOT NULL DEFAULT 'MONEY' CHECK (output_type IN ('MONEY','PERCENT','NUMBER')),
  is_system   boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_computed_col_updated BEFORE UPDATE ON computed_column_def
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();

-- 2.7 import_session — tracks upload lifecycle
CREATE TABLE import_session (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  broker_id                uuid REFERENCES broker(id) ON DELETE SET NULL,
  source_type              text NOT NULL DEFAULT 'EXCEL' CHECK (source_type IN ('EXCEL','CSV','API')),
  status                   text NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED','MAPPED','TRANSFORMED','PREVIEWING','COMMITTED','FAILED')),
  column_mapping           jsonb,
  transform_rules_snapshot jsonb,
  rows_total               integer DEFAULT 0,
  rows_applied             integer DEFAULT 0,
  rows_rejected            integer DEFAULT 0,
  error_msg                text,
  created_at               timestamptz NOT NULL DEFAULT NOW(),
  updated_at               timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE import_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_session_owner ON import_session USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_import_session_updated BEFORE UPDATE ON import_session
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. SEED: System computed column presets
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO computed_column_def (user_id, name, slug, expression, input_vars, output_type, is_system, sort_order) VALUES
  (NULL, 'Invested Value',    'invested_value',    'qty * avg_cost',                          '{qty,avg_cost}',                   'MONEY',   true, 1),
  (NULL, 'Current Value',     'current_value',     'qty * ltp',                               '{qty,ltp}',                        'MONEY',   true, 2),
  (NULL, 'Overall P/L',       'overall_pnl',       '(qty * ltp) - (qty * avg_cost)',          '{qty,ltp,avg_cost}',               'MONEY',   true, 3),
  (NULL, 'Overall P/L %',     'overall_pnl_pct',   '((qty * ltp) - (qty * avg_cost)) / (qty * avg_cost)', '{qty,ltp,avg_cost}',  'PERCENT', true, 4),
  (NULL, 'Today''s Change',   'todays_change',     'qty * (ltp - prev_close)',                '{qty,ltp,prev_close}',             'MONEY',   true, 5),
  (NULL, 'Today''s Change %', 'todays_change_pct', '(ltp - prev_close) / prev_close',        '{ltp,prev_close}',                 'PERCENT', true, 6);

COMMIT;
