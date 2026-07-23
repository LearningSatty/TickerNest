-- Event Calendar feature: stock-related events and custom user events

CREATE TABLE stock_event (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  stock_ticker text,                       -- optional, links to a stock
  event_date   date NOT NULL,
  event_time   time,                       -- optional time of day
  event_type   text NOT NULL DEFAULT 'custom' CHECK (event_type IN ('custom', 'earnings', 'ipo', 'expiry', 'dividend', 'split', 'lock_in', 'other')),
  color        text DEFAULT '#3b82f6',     -- hex color for calendar display
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_event_user ON stock_event(user_id);
CREATE INDEX idx_stock_event_user_date ON stock_event(user_id, event_date);
CREATE INDEX idx_stock_event_ticker ON stock_event(stock_ticker) WHERE stock_ticker IS NOT NULL;

CREATE TRIGGER trg_stock_event_updated BEFORE UPDATE ON stock_event
  FOR EACH ROW EXECUTE FUNCTION tn_set_updated_at();

ALTER TABLE stock_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_event_self ON stock_event
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
