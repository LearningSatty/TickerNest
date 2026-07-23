# TickerNest

Personal investing OS — multi-broker holdings, watchlists, sold-shares journal,
realtime quote ticks. Built around the workflow modelled in your existing
`My Portfolio.xlsx`.

## Layout

```
TickerNest/
├── README.md           ← you are here
├── DEPLOY.md           ← end-to-end deploy guide (Supabase + Upstash + Fly + Vercel)
├── docs/
│   ├── step1-design.md       (v1 — trade-derived; superseded)
│   ├── step1-design-v2.md    (v2 — manual-avg; current spec)
│   └── excel-analysis.md     (parse of My Portfolio.xlsx, 42 sheets)
├── api/                ← NestJS + TypeScript + Postgres (Supabase) + Redis (Upstash)
├── web/                ← React + Vite + TanStack + Tailwind + shadcn-style components
└── android/
    ├── core/           ← pure JVM Kotlin — financial logic, JUnit-tested
    └── app/            ← Compose UI — needs Android SDK to build
```

## Quick commands

| Task | Where | Command |
|---|---|---|
| Run API tests | `api/` | `npx jest` |
| Run web tests | `web/` | `npx vitest run` |
| Run Android core tests | `android/` | `gradle :core:test` |
| Typecheck API | `api/` | `npx tsc --noEmit` |
| Typecheck web | `web/` | `npx tsc --noEmit` |
| Build web | `web/` | `npx vite build` |
| Apply migrations | `api/` | `DATABASE_URL=… npx ts-node src/scripts/migrate.ts` |

See [DEPLOY.md](./DEPLOY.md) for the end-to-end deploy.

## Test scoreboard (last green run)

```
API     : 17 suites · 106 tests
web     :  1 suite  ·   8 tests
android : 3 suites  ·  20 tests
        ──────────────────────
total   : 21 suites · 134 tests
```


## REDIS HEALTH
http://localhost:3000/healthz 


## Deployment:
Your local dev setup already connects to a real, live, hosted Supabase project (not a local DB) — so your holdings/watchlist/broker data is already in the cloud. Pointing production at that same Supabase project means your existing login and data just work — no export/import needed.


##Deployment stack (already scaffolded in the repo, just needs executing):
- Supabase — Postgres + Auth (reuse existing project)
- Upstash — Redis (quote cache)
- Fly.io — API (NestJS + WebSocket), fly.toml/Dockerfile already exist
- Vercel — Web (React/Vite), vercel.json already exists
- There's even a DEPLOY.md in the repo walking through this exact path, plus CI workflows that auto-deploy on main push.

##Scope: core app only (services/api + web) — the mf/intl/physical/onboarding microservices are unfinished per the repo's own notes, so they're excluded. Noted a couple of cosmetic gaps this causes (inert "coming soon" nav tabs, one broken onboarding wizard link) that aren't blockers.

##Steps: verify Supabase migrations are applied → provision Upstash → fly deploy the API with secrets pointing at your existing Supabase project → vercel deploy the web app with matching env vars → confirm CORS/WEB_ORIGIN alignment → smoke-test by logging in with your existing account and confirming real data shows up.
