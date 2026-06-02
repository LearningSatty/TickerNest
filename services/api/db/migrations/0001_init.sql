-- TickerNest — Step 2 schema (v2: manual-avg model, qty=0 retained)
-- Conventions:
--   * All money is NUMERIC(20, 4). No floats.
--   * Every user-scoped table has user_id NOT NULL with RLS USING (user_id = auth.uid()).
--   * Every table has created_at + updated_at; updated_at maintained by trigger.
--   * Soft delete: only on broker (deleted_at). Holdings keep qty=0 instead of deleting.
--   * Idempotency: per-user (user_id, idempotency_key) on idempotency_record;
--     natural keys on holding/import tables already enforce most retries.

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Extensions & helpers
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive ticker comparisons (optional)

-- Mocked auth.uid() for local-dev typecheck. In Supabase this comes for free.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $f$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  END IF;
END $$;

-- updated_at maintenance
CREATE OR REPLACE FUNCTION tn_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Identity (we trust Supabase Auth for the auth.users table; we keep an
--    application-side `app_user` row to hang FKs and preferences off).
-- ----------------------------------------------------------------------------
CREATE TABLE app_user (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_currency  text NOT NULL DEFAULT 'INR' CHECK (display_currency IN ('INR','USD')),
  mover_threshold   numeric(6,4) NOT NULL DEFAULT 0.10 CHECK (mover_threshold >= 0 AND mover_threshold <= 1),
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_app_user_updated BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_user_self ON app_user
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. Broker
-- ----------------------------------------------------------------------------
CREATE TABLE broker (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name            text NOT NULL,                 -- slug, e.g. "kite-juhi"
  display_name    text NOT NULL,                 -- "KITE - JUHI"
  currency        text NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR','USD')),
  sort_order      integer NOT NULL DEFAULT 0,
  csv_profile_key text NOT NULL DEFAULT 'custom'
                  CHECK (csv_profile_key IN
                    ('icici-direct','iifl','groww','kite','angelone','ind-money','mstock','custom')),
  csv_profile     jsonb,                         -- override map; null → built-in default
  -- encrypted PII (column-level AES-GCM via app layer; raw text never leaves server)
  client_id_enc   bytea,
  demat_acc_enc   bytea,
  dp_id_enc       bytea,
  -- secrets like TPIN go to Supabase Vault; we just keep the secret_id reference
  tpin_vault_id   uuid,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);
CREATE INDEX idx_broker_user_active ON broker(user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_broker_updated BEFORE UPDATE ON broker
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE broker ENABLE ROW LEVEL SECURITY;
CREATE POLICY broker_owner ON broker
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. Holding (THE writable source of truth — manual avg, qty=0 retained)
-- ----------------------------------------------------------------------------
CREATE TABLE holding (
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  broker_id   uuid NOT NULL REFERENCES broker(id) ON DELETE CASCADE,
  ticker      text NOT NULL,
  qty         numeric(20,4) NOT NULL CHECK (qty >= 0),
  avg_cost    numeric(20,4) NOT NULL CHECK (avg_cost >= 0),
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, broker_id, ticker)
);
CREATE INDEX idx_holding_user_active ON holding(user_id) WHERE qty > 0;
CREATE INDEX idx_holding_user_ticker ON holding(user_id, ticker);
CREATE TRIGGER trg_holding_updated BEFORE UPDATE ON holding
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE holding ENABLE ROW LEVEL SECURITY;
CREATE POLICY holding_owner ON holding
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. holding_audit (append-only "what changed" log)
--    One row per UPSERT/DELETE; before/after snapshot. Drives:
--      - retrospective "undo last edit"
--      - sold-share derivation if we later want to migrate to a trade ledger.
-- ----------------------------------------------------------------------------
CREATE TABLE holding_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  broker_id       uuid NOT NULL,
  ticker          text NOT NULL,
  before_qty      numeric(20,4),
  before_avg_cost numeric(20,4),
  after_qty       numeric(20,4),
  after_avg_cost  numeric(20,4),
  source          text NOT NULL CHECK (source IN ('MANUAL','CSV','EXCEL','API')),
  source_ref_id   uuid,                         -- csv_import.id or excel_import.id
  changed_at      timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_holding_audit_user_changed ON holding_audit(user_id, changed_at DESC);
CREATE INDEX idx_holding_audit_user_ticker ON holding_audit(user_id, ticker, changed_at DESC);
ALTER TABLE holding_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY holding_audit_owner ON holding_audit
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Append-only: prevent UPDATE / DELETE by anyone except a privileged service role.
CREATE POLICY holding_audit_no_update ON holding_audit FOR UPDATE USING (false);
CREATE POLICY holding_audit_no_delete ON holding_audit FOR DELETE USING (false);

-- ----------------------------------------------------------------------------
-- 5. sold_share — manual sell ledger
-- ----------------------------------------------------------------------------
CREATE TABLE sold_share (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  broker_id           uuid NOT NULL REFERENCES broker(id) ON DELETE CASCADE,
  ticker              text NOT NULL,
  qty                 numeric(20,4) NOT NULL CHECK (qty > 0),
  cost_basis_at_sell  numeric(20,4) NOT NULL CHECK (cost_basis_at_sell >= 0),
  sold_at             timestamptz NOT NULL DEFAULT NOW(),
  sold_price          numeric(20,4),            -- nullable; user fills later
  reason              text,
  mistake             text,
  source              text NOT NULL CHECK (source IN ('MANUAL','CSV','EXCEL','API')),
  source_ref_id       uuid,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sold_share_user_sold ON sold_share(user_id, sold_at DESC);
CREATE INDEX idx_sold_share_user_ticker ON sold_share(user_id, ticker);
CREATE TRIGGER trg_sold_share_updated BEFORE UPDATE ON sold_share
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE sold_share ENABLE ROW LEVEL SECURITY;
CREATE POLICY sold_share_owner ON sold_share
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Immutability: cost_basis_at_sell, qty, sold_at, source* are frozen post-insert.
-- (Enforced by trigger; user-edit fields are sold_price/reason/mistake only.)
CREATE OR REPLACE FUNCTION sold_share_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.qty IS DISTINCT FROM OLD.qty
     OR NEW.cost_basis_at_sell IS DISTINCT FROM OLD.cost_basis_at_sell
     OR NEW.sold_at IS DISTINCT FROM OLD.sold_at
     OR NEW.broker_id IS DISTINCT FROM OLD.broker_id
     OR NEW.ticker IS DISTINCT FROM OLD.ticker
     OR NEW.source IS DISTINCT FROM OLD.source
  THEN
    RAISE EXCEPTION 'sold_share immutable fields cannot be updated';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sold_share_freeze BEFORE UPDATE ON sold_share
  FOR EACH ROW EXECUTE FUNCTION sold_share_freeze();

-- ----------------------------------------------------------------------------
-- 6. Watchlists
-- ----------------------------------------------------------------------------
CREATE TABLE watchlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'STANDARD'
              CHECK (type IN ('STANDARD','INDEX','TO_SELL','IPO')),
  sort_pref   jsonb NOT NULL DEFAULT '{"mode":"DEFAULT"}'::jsonb,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);
CREATE INDEX idx_watchlist_user ON watchlist(user_id, position);
CREATE TRIGGER trg_watchlist_updated BEFORE UPDATE ON watchlist
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY watchlist_owner ON watchlist
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE subsection (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id  uuid NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name          text NOT NULL,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subsection_wl ON subsection(watchlist_id, position);
CREATE TRIGGER trg_subsection_updated BEFORE UPDATE ON subsection
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE subsection ENABLE ROW LEVEL SECURITY;
CREATE POLICY subsection_owner ON subsection
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE watchlist_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsection_id   uuid NOT NULL REFERENCES subsection(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  ticker          text NOT NULL,
  position        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (subsection_id, ticker)
);
CREATE INDEX idx_wlitem_sub ON watchlist_item(subsection_id, position);
CREATE INDEX idx_wlitem_user_ticker ON watchlist_item(user_id, ticker);
ALTER TABLE watchlist_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY watchlist_item_owner ON watchlist_item
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 7. ticker_meta (shared across users; enriched daily)
-- ----------------------------------------------------------------------------
CREATE TABLE ticker_meta (
  ticker                text PRIMARY KEY,
  name                  text,
  sector                text,
  sector_domain         text,
  market_type           text CHECK (market_type IN
                          ('Large Cap','Mid Cap','Small Cap','Micro Cap','ETF')),
  pe_ratio              numeric(20,4),
  market_cap            numeric(28,2),
  fifty_two_wk_high     numeric(20,4),
  fifty_two_wk_low      numeric(20,4),
  prev_close            numeric(20,4),
  today_high            numeric(20,4),
  today_low             numeric(20,4),
  today_volume          bigint,
  avg_volume            bigint,
  listing_date          date,
  currency              text CHECK (currency IN ('INR','USD')),
  indices               text[] NOT NULL DEFAULT ARRAY[]::text[],
  meta_refreshed_at     timestamptz,
  quote_refreshed_at    timestamptz,
  current_price         numeric(20,4),
  updated_at            timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ticker_meta_sector ON ticker_meta(sector);
CREATE INDEX idx_ticker_meta_indices ON ticker_meta USING GIN(indices);
CREATE TRIGGER trg_ticker_meta_updated BEFORE UPDATE ON ticker_meta
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
-- ticker_meta is shared reference data; readable by any authenticated user.
ALTER TABLE ticker_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticker_meta_read ON ticker_meta FOR SELECT USING (auth.uid() IS NOT NULL);
-- Writes restricted to service role (default block).
CREATE POLICY ticker_meta_no_write ON ticker_meta FOR ALL USING (false) WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- 8. Imports (CSV per-broker + Excel onboarding parent)
-- ----------------------------------------------------------------------------
CREATE TYPE import_status AS ENUM ('PARSING','PREVIEW','COMMITTED','FAILED','REPLAYED');

CREATE TABLE excel_import (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  file_hash       text NOT NULL,                  -- sha256 hex
  file_path       text,                           -- supabase storage path
  status          import_status NOT NULL DEFAULT 'PARSING',
  rows_total      integer,
  rows_applied    integer,
  rows_rejected   integer,
  error_msg       text,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, file_hash)
);
CREATE TRIGGER trg_excel_import_updated BEFORE UPDATE ON excel_import
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE excel_import ENABLE ROW LEVEL SECURITY;
CREATE POLICY excel_import_owner ON excel_import
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE csv_import (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  broker_id         uuid NOT NULL REFERENCES broker(id) ON DELETE CASCADE,
  excel_import_id   uuid REFERENCES excel_import(id) ON DELETE CASCADE,
  file_hash         text NOT NULL,
  file_path         text,
  status            import_status NOT NULL DEFAULT 'PARSING',
  profile_used      text NOT NULL,
  rows_total        integer,
  rows_applied      integer,
  rows_rejected     integer,
  diff_preview      jsonb,                          -- adds/updates/unchanged/removes
  rejected_rows     jsonb,
  error_msg         text,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, broker_id, file_hash)
);
CREATE INDEX idx_csv_import_user_status ON csv_import(user_id, status, created_at DESC);
CREATE TRIGGER trg_csv_import_updated BEFORE UPDATE ON csv_import
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE csv_import ENABLE ROW LEVEL SECURITY;
CREATE POLICY csv_import_owner ON csv_import
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 9. Generic idempotency record (drives every mutating endpoint)
-- ----------------------------------------------------------------------------
CREATE TABLE idempotency_record (
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  endpoint        text NOT NULL,                  -- e.g. 'PUT /holdings'
  record_id       uuid,                           -- the natural pk written
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, idempotency_key)
);
CREATE INDEX idx_idem_user_created ON idempotency_record(user_id, created_at DESC);
ALTER TABLE idempotency_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY idem_owner ON idempotency_record
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 10. Other asset classes (lightweight; one table each)
-- ----------------------------------------------------------------------------
CREATE TABLE mutual_fund (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  scheme_code         text NOT NULL,
  name                text NOT NULL,
  type                text,                       -- LargeCap/SmallCap/...
  goal                text,
  sip_amount          numeric(20,4),
  sip_frequency       text CHECK (sip_frequency IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY')),
  units               numeric(20,4) NOT NULL DEFAULT 0,
  avg_nav             numeric(20,4) NOT NULL DEFAULT 0,
  invested            numeric(20,4) NOT NULL DEFAULT 0,
  expense_ratio       numeric(8,4),
  churn_ratio         numeric(8,4),
  cagr                numeric(8,4),
  nominee             text,
  broker              text,                       -- free-text; not a FK
  maturity_date       date,
  current_value       numeric(20,4),
  current_value_at    timestamptz,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scheme_code)
);
CREATE TRIGGER trg_mf_updated BEFORE UPDATE ON mutual_fund
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE mutual_fund ENABLE ROW LEVEL SECURITY;
CREATE POLICY mf_owner ON mutual_fund
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE us_investment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  mode            text NOT NULL CHECK (mode IN ('PACKAGE','MANUAL')),
  broker          text,
  ticker          text NOT NULL,
  qty             numeric(20,4) NOT NULL CHECK (qty >= 0),
  avg_cost_usd    numeric(20,4) NOT NULL CHECK (avg_cost_usd >= 0),
  fx_at_buy       numeric(20,6),                 -- USD->INR rate locked at purchase
  bought_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, mode, ticker, bought_at)
);
CREATE TRIGGER trg_usinv_updated BEFORE UPDATE ON us_investment
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE us_investment ENABLE ROW LEVEL SECURITY;
CREATE POLICY usinv_owner ON us_investment
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE gold_holding (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  purity_grade      integer NOT NULL CHECK (purity_grade IN (999,995,958,916,750,585,500)),
  weight_grams      numeric(20,4) NOT NULL CHECK (weight_grams > 0),
  price_per_gram    numeric(20,4) NOT NULL CHECK (price_per_gram >= 0),
  bought_at         timestamptz,
  source_label      text,                         -- "Tanishq", "Local jeweller", etc.
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_gold_updated BEFORE UPDATE ON gold_holding
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE gold_holding ENABLE ROW LEVEL SECURITY;
CREATE POLICY gold_owner ON gold_holding
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE crypto_holding (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  coin          text NOT NULL,                   -- coingecko id: 'bitcoin'
  qty           numeric(28,12) NOT NULL CHECK (qty >= 0),
  avg_cost      numeric(20,4) NOT NULL CHECK (avg_cost >= 0),
  bought_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, coin)
);
CREATE TRIGGER trg_crypto_updated BEFORE UPDATE ON crypto_holding
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE crypto_holding ENABLE ROW LEVEL SECURITY;
CREATE POLICY crypto_owner ON crypto_holding
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE manual_asset (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('PPF','EPF','FD','REAL_ESTATE','OTHER')),
  label           text NOT NULL,
  principal       numeric(20,4) NOT NULL DEFAULT 0,
  current_value   numeric(20,4) NOT NULL DEFAULT 0,
  opened_at       date,
  matures_at      date,
  current_value_updated_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_manual_asset_updated BEFORE UPDATE ON manual_asset
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE manual_asset ENABLE ROW LEVEL SECURITY;
CREATE POLICY manual_asset_owner ON manual_asset
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE sip_plan (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind            text NOT NULL,                  -- 'rebalancing','tax-loss','sgb',...
  frequency       text NOT NULL,
  amount          numeric(20,4),
  last_done_at    timestamptz,
  next_due_at     timestamptz,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_sip_updated BEFORE UPDATE ON sip_plan
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE sip_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY sip_owner ON sip_plan
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE note (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('DAILY','TRADING','LEARNING','SOLD_RETRO','EVENT')),
  body            text NOT NULL,
  linked_ticker   text,
  linked_sold_id  uuid REFERENCES sold_share(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_note_user_kind ON note(user_id, kind, created_at DESC);
CREATE TRIGGER trg_note_updated BEFORE UPDATE ON note
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE note ENABLE ROW LEVEL SECURITY;
CREATE POLICY note_owner ON note
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 11. Personal vault (encrypted PII)
--   - Column-level ciphertext (bytea) — AES-256-GCM keys held in Supabase Vault.
--   - The vault key id is referenced; the application server is the only place
--     that handles plaintext.
-- ----------------------------------------------------------------------------
CREATE TABLE personal_vault (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN
                    ('PAN','TPIN','NOMINEE','DEMAT','DP_ID','CLIENT_ID','OTHER')),
  label           text NOT NULL,
  ciphertext      bytea NOT NULL,                  -- AES-GCM(plaintext) — server-only
  iv              bytea NOT NULL,
  kms_key_id      uuid NOT NULL,                   -- Supabase Vault secret reference
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind, label)
);
CREATE TRIGGER trg_vault_updated BEFORE UPDATE ON personal_vault
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();
ALTER TABLE personal_vault ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_owner ON personal_vault
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 12. The single materialized view — the Excel "Summary" pivot
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW v_holding_consolidated AS
SELECT
  h.user_id,
  h.ticker,
  SUM(h.qty)                                          AS total_qty,
  CASE WHEN SUM(h.qty) = 0 THEN 0
       ELSE SUM(h.qty * h.avg_cost) / SUM(h.qty)
  END                                                 AS weighted_avg_cost,
  SUM(h.qty * h.avg_cost)                             AS total_invested,
  jsonb_agg(jsonb_build_object(
    'broker_id',   h.broker_id,
    'broker_name', b.display_name,
    'qty',         h.qty,
    'avg_cost',    h.avg_cost
  ) ORDER BY b.sort_order)                            AS per_broker
FROM holding h
JOIN broker b ON b.id = h.broker_id AND b.deleted_at IS NULL
WHERE h.qty > 0
GROUP BY h.user_id, h.ticker;

CREATE UNIQUE INDEX idx_vhc_user_ticker ON v_holding_consolidated(user_id, ticker);
CREATE INDEX idx_vhc_user ON v_holding_consolidated(user_id);
-- CONCURRENT refresh requires a unique index, present above.

-- ----------------------------------------------------------------------------
-- 13. Notify on holding writes (drives MV refresh + WS fan-out)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION holding_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  payload jsonb;
  uid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    uid := OLD.user_id;
    payload := jsonb_build_object('userId', uid, 'ticker', OLD.ticker, 'brokerId', OLD.broker_id, 'op', 'DELETE');
  ELSE
    uid := NEW.user_id;
    payload := jsonb_build_object('userId', uid, 'ticker', NEW.ticker, 'brokerId', NEW.broker_id, 'op', TG_OP);
  END IF;
  PERFORM pg_notify('portfolio_changed', payload::text);
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_holding_notify
  AFTER INSERT OR UPDATE OR DELETE ON holding
  FOR EACH ROW EXECUTE FUNCTION holding_notify();

COMMIT;
