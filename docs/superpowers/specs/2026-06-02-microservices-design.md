# TickerNest Microservices — Design Spec

Status: Approved  
Date: 2026-06-02  
Supersedes: N/A (new capability layer on top of existing `api` service)

---

## 1. Goals

Build 7 missing asset-class features (FX, Mutual Funds, US Investing, Gold, Crypto, Manual Assets, SIP Planner) as **independent microservices** that:

1. Do not degrade performance of the existing Stocks API.
2. Are independently deployable, scalable, and database-isolated.
3. Present as separate **products** in the UI (like Groww's Stocks / MF / F&O tabs).
4. Share auth, types, and utilities via a common package in a monorepo.

---

## 2. Decisions Summary

| Decision | Choice |
|---|---|
| Service grouping | 3 services grouped by similarity |
| Database strategy | Separate Supabase project per service |
| Cross-service communication | API Gateway aggregation (existing `api` acts as gateway) |
| Deployment | All on Fly.io |
| Tech stack | NestJS + TypeScript (same as existing) |
| Auth strategy | Shared npm auth middleware package (`@tickernest/common`) |
| Gateway | Existing `api` service gains `/net-worth` aggregation routes |
| Code organization | Monorepo with Turborepo + npm workspaces |

---

## 3. Monorepo Structure

```
TickerNest/
├── turbo.json
├── package.json                 ← workspace root
├── packages/
│   └── common/                  ← @tickernest/common
│       ├── src/
│       │   ├── auth/
│       │   │   ├── jwt.middleware.ts
│       │   │   ├── jwks.service.ts
│       │   │   └── user-sync.service.ts
│       │   ├── types/
│       │   │   ├── money.ts
│       │   │   ├── summary.dto.ts
│       │   │   └── pagination.dto.ts
│       │   ├── db/
│       │   │   ├── db.module.ts
│       │   │   └── db.service.ts
│       │   ├── crypto.ts
│       │   ├── idempotency.ts
│       │   └── zod.pipe.ts
│       ├── package.json
│       └── tsconfig.json
├── services/
│   ├── api/                     ← existing (migrated from TickerNest/api/)
│   ├── mf/                      ← NEW: Mutual Funds + SIP + ULIP
│   ├── intl/                    ← NEW: US Investing + FX + Crypto
│   └── physical/               ← NEW: Gold + Manual Assets
├── web/                         ← existing (migrated from TickerNest/web/)
└── android/                     ← existing (migrated from TickerNest/android/)
```

---

## 4. Service Definitions

### 4.1 `mf` — Mutual Funds Service

**Fly app:** `tickernest-mf`  
**Port:** 3001  
**Database:** Supabase project `tickernest-mf` (separate Postgres)

**Entities:**

| Table | Description |
|---|---|
| `mutual_fund` | User's MF holdings: scheme_code, fund_name, goal, type, units, avg_nav, current_nav |
| `mf_transaction` | Buy/sell/switch/STP events per fund |
| `sip_plan` | Recurring investment plans: fund, amount, frequency, start/end, status |
| `ulip` | ULIP policies: insurer, plan, premium, maturity_date, fund_value |
| `mf_nav_history` | Daily NAV cache per scheme_code (from mfapi.in) |

**Endpoints:**

```
# Mutual Funds
GET    /funds                    ← list user's MF holdings
GET    /funds/:id                ← single fund with transaction history
POST   /funds                    ← add new fund holding
PUT    /funds/:id                ← update units/avg_nav
DELETE /funds/:id                ← remove fund

# SIP
GET    /sip                      ← list SIP plans
POST   /sip                      ← create SIP plan
PUT    /sip/:id                  ← update (amount, pause, resume)
DELETE /sip/:id                  ← cancel SIP

# ULIP
GET    /ulip                     ← list ULIP policies
POST   /ulip                     ← add ULIP
PUT    /ulip/:id                 ← update fund value / maturity
DELETE /ulip/:id                 ← remove

# Import
POST   /import/csv               ← CSV import with diff-preview-commit

# Summary (for gateway)
GET    /summary                  ← { totalInvested, currentValue, totalPL, plPct, fundCount }

# Health
GET    /health
```

**Background jobs (BullMQ):**
- `nav-poller`: fetch NAV from mfapi.in daily at 23:00 IST (after AMCs publish)
- `sip-reminder`: push notification 1 day before SIP date

**External providers:**
- `mfapi.in` — free NAV API (scheme_code → latest NAV + historical)

---

### 4.2 `intl` — International / Alternative Investments Service

**Fly app:** `tickernest-intl`  
**Port:** 3002  
**Database:** Supabase project `tickernest-intl`

**Entities:**

| Table | Description |
|---|---|
| `us_holding` | US equity positions: ticker, qty, avg_cost_usd, lot_kind (OPEN_MARKET/ESPP/RSU) |
| `us_transaction` | Buy/sell/vest events |
| `fx_rate` | Daily FX rates cache (USD/INR, EUR/INR, etc.) |
| `crypto_holding` | Crypto positions: coin, qty, avg_cost |
| `crypto_transaction` | Buy/sell/swap events |
| `espp_config` | ESPP windows: quarter, discount_pct, purchase_date |

**Endpoints:**

```
# US Investing
GET    /us                       ← list US holdings (with INR conversion)
GET    /us/:id                   ← single holding + transactions
POST   /us                       ← add holding
PUT    /us/:id                   ← update
DELETE /us/:id                   ← remove

# ESPP/RSU
GET    /us/vesting               ← vesting schedule view
POST   /us/vest                  ← record vesting event

# FX
GET    /fx/rates                 ← current rates (cached)
GET    /fx/rates/history         ← historical rates
GET    /fx/convert               ← convert amount between currencies

# Crypto
GET    /crypto                   ← list crypto holdings
GET    /crypto/:id               ← single holding + transactions
POST   /crypto                   ← add holding
PUT    /crypto/:id               ← update
DELETE /crypto/:id               ← remove

# Import
POST   /import/csv               ← CSV import

# Summary (for gateway)
GET    /summary                  ← { us: {invested, current, pl}, crypto: {invested, current, pl}, totalINR }

# Health
GET    /health
```

**Background jobs (BullMQ):**
- `fx-poller`: fetch daily FX from exchangerate.host (1x/day)
- `us-quote-poller`: fetch US stock quotes from Yahoo (market hours, 15s interval)
- `crypto-poller`: fetch crypto spot from CoinGecko (every 60s)

**External providers:**
- Yahoo Finance (`yahoo-finance2`) — US equity quotes
- `exchangerate.host` — FX rates
- CoinGecko — crypto spot prices

---

### 4.3 `physical` — Physical & Manual Assets Service

**Fly app:** `tickernest-physical`  
**Port:** 3003  
**Database:** Supabase project `tickernest-physical`

**Entities:**

| Table | Description |
|---|---|
| `gold_holding` | Physical gold: weight_grams, purity, purchase_price, purchase_date |
| `sgb_holding` | Sovereign Gold Bonds: units, purchase_nav, maturity_date, coupon_rate |
| `manual_asset` | Catch-all: type (PPF/EPF/FD/NPS/RE/Insurance), current_value, invested, maturity |
| `manual_asset_event` | Contributions/withdrawals/interest credits per asset |
| `gold_rate_history` | Daily gold rate cache (24K/22K per gram) |

**Endpoints:**

```
# Gold
GET    /gold                     ← list gold holdings (physical + SGB)
POST   /gold                     ← add gold holding
PUT    /gold/:id                 ← update
DELETE /gold/:id                 ← remove

# SGB
GET    /sgb                      ← list SGB holdings
POST   /sgb                      ← add SGB
PUT    /sgb/:id                  ← update
DELETE /sgb/:id                  ← remove

# Manual Assets
GET    /assets                   ← list manual assets (PPF, EPF, FD, NPS, RE, Insurance)
GET    /assets/:id               ← single asset + event history
POST   /assets                   ← add asset
PUT    /assets/:id               ← update current value
DELETE /assets/:id               ← remove

# Asset Events (contributions, withdrawals)
POST   /assets/:id/events        ← add event (deposit, withdrawal, interest)
GET    /assets/:id/events        ← list events

# Import
POST   /import/csv               ← CSV import

# Summary (for gateway)
GET    /summary                  ← { gold: {grams, valueINR}, sgb: {units, valueINR}, assets: [{type, value}], totalINR }

# Health
GET    /health
```

**Background jobs (BullMQ):**
- `gold-rate-poller`: fetch gold rates from MCX/IBJA daily (scrape with circuit breaker)
- `maturity-reminder`: push notification 30 days before FD/SGB/ULIP maturity

**External providers:**
- MCX / IBJA — gold reference rates (scrape behind circuit breaker)

---

## 5. Shared Package: `@tickernest/common`

Published as a workspace package (not to npm). All services depend on it.

### 5.1 Auth Middleware

```typescript
// packages/common/src/auth/jwt.middleware.ts
// Validates Supabase JWT, extracts user_id
// All services share the same SUPABASE_JWT_SECRET from the main project
// On first request from a new user: upserts into local `user` table (user-sync)
```

The JWT secret comes from the **main** Supabase project (`tickernest-main`). Each microservice's Supabase project stores only domain data — user identity is validated against the shared secret.

### 5.2 Summary DTO

```typescript
// packages/common/src/types/summary.dto.ts
export interface ServiceSummary {
  totalInvested: string;    // NUMERIC as string
  currentValue: string;
  totalPL: string;
  plPct: number;
  asOf: string;             // ISO timestamp
  breakdown: Record<string, {
    invested: string;
    current: string;
    pl: string;
  }>;
}
```

Every service's `GET /summary` returns this shape. The gateway assembles them.

### 5.3 Other Shared Utilities

- `money.ts` — arithmetic on NUMERIC(20,4) strings (add, subtract, multiply, divide, format)
- `idempotency.ts` — Idempotency-Key middleware + Postgres dedupe table pattern
- `zod.pipe.ts` — NestJS validation pipe using Zod schemas
- `crypto.ts` — AES-256 encrypt/decrypt for PII columns
- `db.module.ts` — Supabase client factory (reads `DATABASE_URL` from env)
- `pagination.dto.ts` — cursor-based pagination types

---

## 6. Gateway Routes (added to existing `api` service)

```typescript
// services/api/src/gateway/gateway.controller.ts

@Get('/net-worth')
async getNetWorth(@User() user) {
  const [stocks, mf, intl, physical] = await Promise.all([
    this.portfolioService.getSummary(user.id),          // local
    this.httpService.get('http://tickernest-mf.internal:3001/summary', headers),
    this.httpService.get('http://tickernest-intl.internal:3002/summary', headers),
    this.httpService.get('http://tickernest-physical.internal:3003/summary', headers),
  ]);

  return {
    stocks,
    mutualFunds: mf,
    international: intl,
    physicalAssets: physical,
    total: {
      invested: add(stocks.totalInvested, mf.totalInvested, intl.totalInvested, physical.totalInvested),
      current: add(stocks.currentValue, mf.currentValue, intl.currentValue, physical.currentValue),
      pl: add(stocks.totalPL, mf.totalPL, intl.totalPL, physical.totalPL),
    },
  };
}
```

**Internal networking:** Fly's private networking (`.internal` DNS) keeps service-to-service calls off the public internet. Zero-cost, sub-1ms latency within the same region.

**Failure handling:** If a downstream service is unreachable, return partial data with a `degraded: true` flag and the error source. The frontend shows available data with a banner for unavailable sections.

---

## 7. Frontend Product Switcher

```
┌──────────────────────────────────────────────────────────────┐
│ 🟢  Stocks    Mutual Funds    Investments    Assets          │
├──────────────────────────────────────────────────────────────┤
│  [Sub-nav varies per product]                                 │
└──────────────────────────────────────────────────────────────┘
```

| Tab | Route prefix | Backend | Sub-nav |
|---|---|---|---|
| Stocks | `/stocks` | `api` | Dashboard, Holdings, Watchlist, Sold Shares |
| Mutual Funds | `/mf` | `mf` | Portfolio, SIP, ULIP, Explore |
| Investments | `/investments` | `intl` | US Stocks, Crypto, FX |
| Assets | `/assets` | `physical` | Gold, PPF/EPF, FD, Other |

Each tab is a **lazy-loaded route group** — switching tabs loads that product's bundle. The API base URL switches per product:

```typescript
// web/src/lib/api.ts
const SERVICE_URLS = {
  stocks: import.meta.env.VITE_API_URL,           // tickernest-api.fly.dev
  mf: import.meta.env.VITE_MF_URL,               // tickernest-mf.fly.dev
  intl: import.meta.env.VITE_INTL_URL,            // tickernest-intl.fly.dev
  physical: import.meta.env.VITE_PHYSICAL_URL,    // tickernest-physical.fly.dev
};
```

---

## 8. Database Schema (per service)

### 8.1 `tickernest-mf` (Mutual Funds)

```sql
-- Users (synced on first JWT)
CREATE TABLE "user" (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE mutual_fund (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
  scheme_code TEXT NOT NULL,
  fund_name TEXT NOT NULL,
  amc TEXT,
  category TEXT,          -- equity/debt/hybrid/elss
  goal TEXT,              -- retirement/education/emergency/wealth
  units NUMERIC(20,6) NOT NULL,
  avg_nav NUMERIC(20,4) NOT NULL,
  current_nav NUMERIC(20,4),
  invested NUMERIC(20,4) GENERATED ALWAYS AS (units * avg_nav) STORED,
  current_value NUMERIC(20,4) GENERATED ALWAYS AS (units * current_nav) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, scheme_code)
);

CREATE TABLE mf_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
  fund_id UUID NOT NULL REFERENCES mutual_fund(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','SWITCH_IN','SWITCH_OUT','STP_IN','STP_OUT','DIVIDEND')),
  units NUMERIC(20,6) NOT NULL,
  nav NUMERIC(20,4) NOT NULL,
  amount NUMERIC(20,4) NOT NULL,
  transacted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sip_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
  fund_id UUID REFERENCES mutual_fund(id),
  fund_name TEXT NOT NULL,
  amount NUMERIC(20,4) NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('MONTHLY','WEEKLY','QUARTERLY')),
  sip_date INT CHECK (sip_date BETWEEN 1 AND 28),
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','COMPLETED','CANCELLED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ulip (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
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

CREATE TABLE mf_nav_history (
  scheme_code TEXT NOT NULL,
  date DATE NOT NULL,
  nav NUMERIC(20,4) NOT NULL,
  PRIMARY KEY (scheme_code, date)
);

-- RLS
ALTER TABLE mutual_fund ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_funds ON mutual_fund USING (user_id = auth.uid());
-- (same pattern for all user-owned tables)
```

### 8.2 `tickernest-intl` (International / Crypto)

```sql
CREATE TABLE "user" (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE us_holding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
  ticker TEXT NOT NULL,
  name TEXT,
  sector TEXT,
  qty NUMERIC(20,6) NOT NULL,
  avg_cost_usd NUMERIC(20,4) NOT NULL,
  lot_kind TEXT NOT NULL DEFAULT 'OPEN_MARKET'
    CHECK (lot_kind IN ('OPEN_MARKET','ESPP','RSU','BONUS')),
  broker_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker, lot_kind, broker_name)
);

CREATE TABLE us_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
  holding_id UUID NOT NULL REFERENCES us_holding(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','VEST','DIVIDEND')),
  qty NUMERIC(20,6) NOT NULL,
  price_usd NUMERIC(20,4) NOT NULL,
  fx_rate NUMERIC(12,4),            -- USD/INR at time of transaction
  fees_usd NUMERIC(20,4) DEFAULT 0,
  transacted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE espp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
  company TEXT NOT NULL,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 15,
  purchase_frequency TEXT DEFAULT 'QUARTERLY',
  next_purchase_date DATE,
  contribution_pct NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fx_rate (
  pair TEXT NOT NULL,                -- 'USD/INR', 'EUR/INR'
  date DATE NOT NULL,
  rate NUMERIC(12,4) NOT NULL,
  source TEXT DEFAULT 'exchangerate.host',
  PRIMARY KEY (pair, date)
);

CREATE TABLE crypto_holding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
  coin TEXT NOT NULL,                -- 'BTC', 'ETH', etc.
  name TEXT,
  qty NUMERIC(20,8) NOT NULL,
  avg_cost_inr NUMERIC(20,4) NOT NULL,
  platform TEXT,                     -- 'WazirX', 'CoinDCX', 'Binance'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, coin, platform)
);

CREATE TABLE crypto_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
  holding_id UUID NOT NULL REFERENCES crypto_holding(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','SWAP','REWARD','AIRDROP')),
  qty NUMERIC(20,8) NOT NULL,
  price_inr NUMERIC(20,4) NOT NULL,
  fees_inr NUMERIC(20,4) DEFAULT 0,
  transacted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS on all user tables
```

### 8.3 `tickernest-physical` (Gold + Manual Assets)

```sql
CREATE TABLE "user" (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gold_holding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
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

CREATE TABLE sgb_holding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
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

CREATE TABLE manual_asset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
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

CREATE TABLE manual_asset_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
  asset_id UUID NOT NULL REFERENCES manual_asset(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAWAL','INTEREST','MATURITY','PREMIUM')),
  amount NUMERIC(20,4) NOT NULL,
  event_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gold_rate_history (
  date DATE NOT NULL PRIMARY KEY,
  rate_24k_per_gram NUMERIC(20,4) NOT NULL,
  rate_22k_per_gram NUMERIC(20,4),
  source TEXT DEFAULT 'IBJA'
);

-- RLS on all user tables
```

---

## 9. Migration Plan (existing → monorepo)

1. **Phase 1: Restructure repo** — move `api/`, `web/`, `android/` into `services/` and root. Add `turbo.json`, workspace `package.json`.
2. **Phase 2: Extract `@tickernest/common`** — pull auth, types, db, crypto out of `services/api/src/common/` into `packages/common/`. Update imports in `api`.
3. **Phase 3: Scaffold services** — `mf`, `intl`, `physical` as new NestJS apps depending on `@tickernest/common`.
4. **Phase 4: Build each service** — implement entities, endpoints, jobs per service.
5. **Phase 5: Gateway routes** — add `/net-worth` to existing `api`.
6. **Phase 6: Frontend product switcher** — add top nav tabs, lazy-load route groups.
7. **Phase 7: Deploy** — create 3 Supabase projects + 3 Fly apps.

---

## 10. Fly.io Configuration (per service)

```toml
# services/mf/fly.toml (example)
app = "tickernest-mf"
primary_region = "bom"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3001"
  NODE_ENV = "production"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  path = "/health"
  timeout = "5s"
```

Secrets per service (set via `fly secrets set`):
- `DATABASE_URL` — service-specific Supabase pooler URL
- `REDIS_URL` — shared Upstash Redis (queues namespaced per service: `mf:*`, `intl:*`, `physical:*`)
- `SUPABASE_JWT_SECRET` — shared from main project

---

## 11. Testing Strategy

Each service follows the same pattern as the existing `api`:

- **Unit tests:** Pure logic (aggregation, computation, DTOs) — Jest
- **Integration tests:** Repository + DB interaction — Jest + test Supabase
- **E2E tests:** Full HTTP calls — Supertest

Turborepo runs all tests in parallel:
```bash
turbo run test          # all services
turbo run test --filter=@tickernest/mf   # single service
```

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Fly free tier limit (3 machines) | Start with `auto_stop_machines=true`; services cold-start in ~2s. 1 always-on (api) + 3 auto-stop = within limits. |
| 4 Supabase free projects limit | Supabase allows multiple free projects per account. If hit, consolidate `physical` into `intl`. |
| Shared JWT secret leak | Rotate via Supabase dashboard; all services read from env, no code change needed. |
| Gateway latency (4 parallel calls) | Internal networking is sub-1ms. Total /net-worth p99 target: <200ms. Cache summary responses for 30s in Redis. |
| Monorepo build complexity | Turborepo handles caching + parallel builds. Each service has independent `Dockerfile`. |

---

## 13. Out of Scope (future)

- WebSocket realtime for MF/Crypto (can add later per service)
- Mobile deep-linking between products
- Cross-service search (would need Elasticsearch/Typesense)
- Shared notification service (each service handles its own for now)
