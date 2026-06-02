# TickerNest — Deploy Guide

End-to-end vertical slice on entirely free tiers. ~30 min from zero.

## 1. Supabase (Postgres + Auth + Storage)

1. Create project at https://supabase.com (Free tier, region: ap-south-1).
2. **Project Settings → Database → Connection string** → use the **pooler** URL (port 6543) for the API; the direct URL (5432) is fine locally.
3. **Project Settings → API** → copy `JWT secret` → set as `SUPABASE_JWT_SECRET` on Fly.
   Copy `anon public` key → set as `VITE_SUPABASE_ANON_KEY` on Vercel.
4. Apply schema:
   ```bash
   cd TickerNest/api
   DATABASE_URL=<direct-url> npx ts-node src/scripts/migrate.ts
   ```
   (Or let the Fly `release_command` do it on first deploy.)
5. **Authentication → Providers** → enable Email and Google.

## 2. Upstash (Redis)

1. Create a Free Redis at https://upstash.com (region matching Fly: bom).
2. Copy the `redis://` URL → set as `REDIS_URL` on Fly.

## 3. Fly.io (API)

```bash
cd TickerNest/api
fly launch --no-deploy --copy-config --name tickernest-api
fly secrets set \
  DATABASE_URL=<supabase-pooler-url> \
  REDIS_URL=<upstash-url> \
  SUPABASE_JWT_SECRET=<jwt-secret> \
  WEB_ORIGIN=https://tickernest.app
fly deploy
fly status   # check the machine is healthy
fly logs     # watch the listener attach
```

The `release_command` runs `dist/scripts/migrate.js` before traffic, so every
deploy reapplies any new SQL migrations forward-only.

Health check: `https://tickernest-api.fly.dev/healthz` returns `{ ok: true, db: true }`.

## 4. Vercel (Web)

```bash
cd TickerNest/web
vercel link
vercel env add VITE_API_URL production
# https://tickernest-api.fly.dev
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel deploy --prod
```

## 5. CI (GitHub Actions)

Both `api/.github/workflows/ci.yml` and
`web/.github/workflows/ci.yml` run typecheck + tests on every PR
and main commit. The backend workflow additionally deploys to Fly when
`main` is pushed — set `FLY_API_TOKEN` repository secret first:

```bash
fly auth token   # copy
gh secret set FLY_API_TOKEN --body "<token>"
```

## 6. Smoke test the vertical slice

```bash
# 1. sign in via the web app, copy the JWT from sessionStorage 'tn:jwt'
TOK=...
curl -H "Authorization: Bearer $TOK" https://tickernest-api.fly.dev/healthz
curl -H "Authorization: Bearer $TOK" https://tickernest-api.fly.dev/brokers
curl -H "Authorization: Bearer $TOK" https://tickernest-api.fly.dev/portfolio/consolidated
# 2. upload your existing My-Portfolio.xlsx via /import/excel page
# 3. /portfolio should populate — check the per-broker columns match Excel
```

## 7. Free-tier limits to watch

| Resource | Free limit | What hits it first |
|---|---|---|
| Supabase Postgres | 500 MB / 50k MAU | ticker_meta + holding_audit growth — both bounded |
| Supabase Storage | 1 GB | CSV/XLSX uploads. Add a lifecycle: keep last 5 imports per (user, broker). |
| Upstash Redis | 10k cmd/day | Quote cache. With 1 user, 1 batch poll every 5s × 12h = ~9k. Borderline; consider raising TTL when market closed. |
| Fly.io | 3 shared-cpu-1x | One API instance + one for staging. WS fan-out caps at ~5k clients. |
| Vercel | 100 GB bandwidth/mo | Static SPA — should never hit. |
| Yahoo (yahoo-finance2) | informal | Watch HTTP 429s. The QuoteProvider seam lets you swap to Finnhub / Twelve Data. |

## 8. What's not yet in the slice

- The Android `:app` module needs Android Studio + SDK to build — see `android/README` (TODO).
- ~~A scheduled `quote-poller` cron + `ticker-meta` daily refresh job~~ ✅ **Done** — `api/src/quote/quote.poller.ts` (BullMQ, 5 s market / 60 s closed) and `api/src/quote/ticker-meta.enricher.ts` (BullMQ cron, daily 03:00 IST). Both start automatically when `REDIS_URL` is set.
- Personal vault encryption uses Supabase Vault for TPIN/PAN; the `_enc` columns on `broker` are populated by the application server using `crypto.encryptPii()` — service code for that not yet exposed.
- FX (`/fx`), mutual funds (`/mf`), US investing (`/us`), gold, crypto, manual assets, SIP planner — modelled in DDL, no controllers yet.
