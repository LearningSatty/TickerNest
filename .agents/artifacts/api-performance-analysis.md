# TickerNest API Performance Analysis

## Measured Latencies (from India → Supabase AP-South-1 + Yahoo Finance)

| Component | Latency | Notes |
|-----------|---------|-------|
| DB connect (cold) | ~537ms | First connection to Supabase pooler |
| DB query (warm) | ~45-50ms | Subsequent queries on existing connection |
| Yahoo /chart (single) | ~120-260ms | Varies by network conditions |
| Yahoo /chart (batch of 5, parallel) | ~160ms | All 5 in parallel |
| Yahoo /search | ~213ms | Single search query |
| Yahoo /news | ~119ms | Single news query |
| Yahoo detail (1y + 5d parallel) | ~120ms | Two calls in parallel |

---

## Page-by-Page API Call Breakdown

### Global (on every page — AppShell)

| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `GET /market/snapshot` | 12 market indices + user breadth. DB query for user tickers → Yahoo fetch for 12+ tickers (3 batches × 5 parallel) | **~350ms** (50ms DB + 250ms Yahoo) |
| `GET /brokers` | List user's brokers for sidebar | **~50ms** (DB only) |
| WebSocket connect | Realtime portfolio change notifications | **~100ms** |

**Total AppShell load: ~400ms** (market snapshot is the bottleneck, brokers parallel)

---

### 1. `/dashboard` (Landing Page)

| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `GET /portfolio/consolidated` | All holdings + quotes for each ticker | **~350-600ms** |
| `GET /movers?threshold=0.10` | Universe (holdings ∪ watchlist) tickers → quotes → sort by |Δ| | **~300-500ms** |
| `GET /notes` | User's notes (DB only) | **~50ms** |
| `GET /events/today` | Today's stock events (DB only) | **~50ms** |

**Parallel total: ~600ms** (consolidated & movers are heaviest, run in parallel)

Breakdown of `/portfolio/consolidated`:
- 2 DB queries in parallel (holdings + brokers): ~50ms
- 1 DB query (ticker_meta): ~50ms
- Yahoo quotes for N tickers (N/5 batches): ~160-400ms depending on how many tickers

Breakdown of `/movers`:
- 1 DB query (UNION holdings + watchlist tickers): ~50ms
- Yahoo quotes for N tickers: ~160-400ms

---

### 2. `/portfolio` (Consolidated Portfolio)

| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `GET /portfolio/consolidated` | Same as dashboard | **~350-600ms** |

**Total: ~350-600ms**

---

### 3. `/portfolio/sector` (By Sector View)

| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `GET /portfolio/consolidated` | Same data, grouped by sector on frontend | **~350-600ms** |

**Total: ~350-600ms**

---

### 4. `/watchlists` (Watchlists Hub)

| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `GET /watchlists` | List all watchlists (DB only) | **~50ms** |
| `GET /watchlists/groups` | List groups (DB only) | **~50ms** |
| `GET /watchlists/movers?limit=8` | Top movers across all watchlists → Yahoo quotes | **~300-500ms** |
| `GET /watchlists/news?limit=10` | News for up to 6 tickers (6 parallel Yahoo calls) | **~200-400ms** |

**Parallel total: ~500ms** (movers & news are heaviest)

---

### 5. `/watchlists/:id` (Single Watchlist Detail)

| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `GET /watchlists/:id` | Watchlist items + live quotes for each ticker | **~250-500ms** |

Breakdown:
- DB: watchlist + items + ticker_meta join: ~50ms
- Yahoo quotes for N tickers in watchlist: ~160-400ms

**Total: ~250-500ms**

---

### 6. `/stock/:ticker` (Stock Detail Page)

| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `GET /quotes/:ticker` | 2 parallel Yahoo calls (1y chart + 5d chart) | **~120-260ms** |
| `GET /quotes/:ticker/chart?range=1mo` | 1 Yahoo call | **~120-260ms** |
| `GET /quotes/:ticker/news?limit=10` | 1 Yahoo search/news call | **~120-260ms** |
| `GET /watchlists` | For "add to watchlist" feature | **~50ms** |

**Parallel total: ~260ms** (all 4 calls run in parallel via React Query)

---

### 7. `/sold` (Sold Shares)

| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `GET /sold-shares` | DB only (no live quotes needed) | **~50ms** |

**Total: ~50ms**

---

### 8. `/notes` (Notes Page)

| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `GET /notes/folders/list` | DB only | **~50ms** |
| `GET /notes` | DB only | **~50ms** |

**Parallel total: ~50ms**

---

### 9. `/calendar` (Event Calendar)

| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `GET /events?month=YYYY-MM` | DB only | **~50ms** |
| `GET /events?from=...&to=...` | DB only (year view) | **~50ms** |

**Parallel total: ~50ms**

---

### 10. `/broker/:id` (Broker Holdings)

| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `GET /holdings/:brokerId` | Holdings for one broker (DB only, no live quotes in list) | **~50ms** |

**Total: ~50ms**

---

### 11. `/import/excel` (Excel Onboarding)

No initial API calls — only on file upload:
| API Call | What it does | Estimated Time |
|----------|-------------|----------------|
| `POST /imports/excel` (on upload) | Parse Excel, diff engine, upsert | **~500-2000ms** (depends on file size) |

---

### 12. `/settings`

No API calls — purely frontend state (theme toggle).

---

### 13. `/mf`, `/investments`, `/assets`

These are stub pages with no API calls (placeholder UI only).

---

## Full Page Visit Sequence (Cold Start)

If you stop the server, restart, and visit every page sequentially:

```
Login → AppShell loads:
  ├─ /market/snapshot .............. ~350ms (12 Yahoo calls + DB)
  ├─ /brokers ...................... ~50ms  (DB)
  └─ WebSocket connect ............. ~100ms

/dashboard:
  ├─ /portfolio/consolidated ....... ~600ms (DB + Yahoo for N holdings)
  ├─ /movers ....................... ~500ms (DB + Yahoo for N tickers)
  ├─ /notes ........................ ~50ms  (DB)
  └─ /events/today ................. ~50ms  (DB)
  TOTAL: ~600ms (parallel)

/portfolio:
  └─ /portfolio/consolidated ....... ~600ms (or CACHED from dashboard)
  TOTAL: 0ms if cached, ~600ms if stale

/watchlists:
  ├─ /watchlists ................... ~50ms  (DB)
  ├─ /watchlists/groups ............ ~50ms  (DB)
  ├─ /watchlists/movers ............ ~500ms (DB + Yahoo)
  └─ /watchlists/news .............. ~400ms (6× Yahoo news)
  TOTAL: ~500ms (parallel)

/watchlists/:id:
  └─ /watchlists/:id ............... ~500ms (DB + Yahoo for watchlist tickers)
  TOTAL: ~500ms

/stock/:ticker:
  ├─ /quotes/:ticker ............... ~260ms (2× Yahoo parallel)
  ├─ /quotes/:ticker/chart ......... ~130ms (1× Yahoo)
  ├─ /quotes/:ticker/news .......... ~130ms (1× Yahoo)
  └─ /watchlists ................... ~50ms  (DB, already cached)
  TOTAL: ~260ms (parallel)

/sold:
  └─ /sold-shares .................. ~50ms  (DB only)
  TOTAL: ~50ms

/notes:
  ├─ /notes/folders/list ........... ~50ms  (DB)
  └─ /notes ........................ ~50ms  (DB, likely cached)
  TOTAL: ~50ms

/calendar:
  ├─ /events?month=... ............. ~50ms  (DB)
  └─ /events?from=...&to=... ....... ~50ms  (DB)
  TOTAL: ~50ms

/broker/:id:
  └─ /holdings/:id ................. ~50ms  (DB)
  TOTAL: ~50ms

/settings: 0ms (no API calls)
/mf, /investments, /assets: 0ms (stub pages)
```

## Summary: Time Budget for Full Site Walkthrough

| Phase | Time | Bottleneck |
|-------|------|-----------|
| AppShell + Dashboard (first load) | **~1000ms** | Yahoo quotes for market + portfolio |
| Portfolio page | **~0ms** (cached) or **~600ms** | Yahoo quotes for holdings |
| Watchlists hub | **~500ms** | Yahoo quotes + news |
| Single watchlist | **~500ms** | Yahoo quotes for items |
| Stock detail | **~260ms** | Yahoo chart/detail/news (parallel) |
| DB-only pages (sold, notes, calendar, broker) | **~50ms each** | Supabase round-trip |

**Grand total to visit every page sequentially: ~3-4 seconds** (with caching between pages)
**Without any cache: ~5-6 seconds** (worst case, each page hits Yahoo fresh)

## Key Observations

1. **Yahoo Finance API is the #1 bottleneck** — accounts for 70-80% of latency on heavy pages.
2. **DB queries are fast** (~45-50ms) thanks to Supabase connection pooling in AP-South-1.
3. **Redis cache (when configured) eliminates repeat Yahoo calls** — reduces `/market/snapshot` to ~50ms on subsequent requests.
4. **React Query caching helps significantly** — `staleTime` prevents redundant refetches when navigating between pages.
5. **Batch size of 5 for Yahoo is the sweet spot** — going higher risks rate-limiting (HTTP 429).
