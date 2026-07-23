# TickerNest Production Deployment Plan

## Context

TickerNest today only runs on localhost (API on :3000, web on :5173). The goal is
to make it reachable from anywhere as a real production app, using the same
personal data (holdings, watchlists, brokers, sold-shares journal, notes) that
already exists from local development — without any manual export/import.

**Key discovery from exploration:** local dev is *not* pointed at a local
Postgres — `services/api/.env` and `web/.env.local` already point at a real,
live, hosted Supabase project (`puyhvezygnnbudsjjxfj.supabase.co`, region
`ap-south-1`). Every domain table (`holding`, `watchlist`, `broker`,
`sold_share`, `note`, etc.) is scoped by `user_id uuid` = the Supabase Auth
`auth.uid()`, enforced by Postgres RLS (`USING (user_id = auth.uid())`). So the
dev user's data is *already* sitting in the cloud database that production
will use — as long as production is pointed at this **same** Supabase project
(not a fresh one), all existing data and the existing login just work, with
zero migration scripts needed.

The repo also already has most of the deployment scaffolding built and
committed: `DEPLOY.md` (step-by-step guide), `services/api/fly.toml` +
`Dockerfile` (API → Fly.io), `web/vercel.json` (Web → Vercel), and CI workflows
(`services/api/.github/workflows/ci.yml` auto-deploys to Fly on `main` push;
`web/.github/workflows/ci.yml` runs typecheck+tests). This plan executes that
existing scaffolding correctly, rather than inventing a new deploy path.

Per your decisions: deploy **only the core app** (`services/api` + `web`) — the
`mf` / `intl` / `physical` / `onboarding` microservices are unfinished
(DDL modeled, but DEPLOY.md itself notes "no controllers yet" for most) and
are out of scope for this pass. Use the **existing Fly.io + Vercel + Supabase +
Upstash stack** (all free-tier) rather than alternatives like Railway/Render.
Point production at the **same Supabase project** already used in local dev so
existing data and login carry over automatically.

## Deployment Option Chosen (for reference)

| Layer | Platform | Why |
|---|---|---|
| Postgres + Auth | **Supabase** (existing project `puyhvezygnnbudsjjxfj`) | Already holds all your real data; reuse it, don't create a new one |
| Redis (quote cache) | **Upstash** | Free tier, low-latency to Fly's Mumbai region |
| API (NestJS + WS) | **Fly.io** (`services/api`) | `fly.toml`/`Dockerfile` already exist; supports persistent WS connections (`min_machines_running=1`) which Vercel/serverless can't |
| Web (React/Vite) | **Vercel** (`web`) | `vercel.json` already exists; free static hosting + auto SSL |

(Alternatives like Railway/Render/a VPS were considered but rejected — they'd
require writing new deploy config from scratch and ignore scaffolding that
already exists and matches the app's needs, e.g. Fly's support for
long-lived WebSocket connections.)

## Steps

### 1. Verify/prepare the Supabase project (no new project)
- Use the existing project already referenced in `services/api/.env` /
  `web/.env.local` (`puyhvezygnnbudsjjxfj.supabase.co`).
- Confirm all 15 migrations in `services/api/db/migrations/0001..0015` are
  applied: `DATABASE_URL=<session-pooler-url> npx ts-node src/scripts/migrate.ts`
  from `services/api/`. The script is idempotent (tracks applied files via
  `_tn_migrations` + SHA-256), so re-running is safe.
- In Supabase dashboard → **Authentication → Providers**, confirm Email (and
  Google, if used) is enabled — this is the same account you already log in
  with locally, so no new signup is needed.
- Grab the two values needed later: **Project Settings → API → JWT secret**
  and **Project Settings → Database → Connection string (pooler)**.

### 2. Provision Upstash Redis
- Create a free Redis DB at upstash.com, region `bom` (matches Fly's Mumbai
  region for lowest latency to the quote cache).
- Copy the `redis://` connection URL for use as `REDIS_URL` in step 3.

### 3. Deploy the API to Fly.io
- From `services/api/`, sanity-check the Docker build succeeds standalone
  first: `docker build -t tickernest-api .` (the Dockerfile builds
  `services/api` in isolation without the `packages/common` workspace step
  that `mf`/`intl`/`physical` Dockerfiles use — worth confirming `services/api`
  doesn't actually import `@tickernest/common` before deploying, since if it
  does, the image build will fail).
- `fly launch --no-deploy --copy-config --name <your-app-name>` (reuses the
  existing `fly.toml`).
- `fly secrets set DATABASE_URL=<supabase-pooler-url:6543> REDIS_URL=<upstash-url> SUPABASE_URL=<same-supabase-project-url> SUPABASE_JWT_SECRET=<from-step-1> WEB_ORIGIN=<your-vercel-domain>`
  — reuse the exact `DATABASE_URL`/`SUPABASE_URL` values from your local
  `services/api/.env`, since this is the *same* project.
- `WEB_ORIGIN` in `fly.toml`'s `[env]` block is currently hardcoded to
  `https://tickernest.app`; if you don't own that domain, either edit
  `fly.toml` to your actual Vercel URL or override it via `fly secrets set`
  (secrets take precedence).
- `fly deploy`. The `[deploy] release_command = "node dist/scripts/migrate.js"`
  in `fly.toml` re-applies any pending SQL migrations automatically before
  routing traffic — this is the same migrator from step 1, just run
  automatically on every deploy going forward.
- Verify: `fly status` (machine healthy) and `curl https://<app>.fly.dev/healthz`
  → expect `{ ok: true, db: true }`.

### 4. Deploy the Web app to Vercel
- From `web/`, `vercel link`, then set production env vars matching the
  **same Supabase project** used locally:
  - `VITE_API_URL` → your Fly API URL from step 3
  - `VITE_SUPABASE_URL` → same value as `web/.env.local`'s `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY` → same value as `web/.env.local`'s anon key
- `vercel deploy --prod`.
- Once you know the final Vercel URL, go back and make sure Fly's
  `WEB_ORIGIN` secret (step 3) matches it exactly — the API's CORS check will
  reject requests from any other origin.

### 5. Wire up CI auto-deploy (optional but already scaffolded)
- `services/api/.github/workflows/ci.yml` already deploys to Fly on every
  `main` push, gated on the `FLY_API_TOKEN` repo secret:
  `fly auth token` → `gh secret set FLY_API_TOKEN --body "<token>"`.
- Vercel auto-deploys on push once the project is linked (`vercel link`), no
  extra GitHub secret needed.

### 6. Confirm your existing data & login just work
- No export/import step is needed — sign in on the deployed web app with the
  **same email/password (or Google) account** you use locally. Because
  production points at the identical Supabase project, `auth.uid()` resolves
  to the same user id, and RLS (`user_id = auth.uid()`) surfaces the exact
  same `holding`/`watchlist`/`broker`/`sold_share`/`note` rows you already
  have.
- Smoke test (per `DEPLOY.md` §6): sign in, copy the JWT from
  `sessionStorage['tn:jwt']`, then:
  ```
  curl -H "Authorization: Bearer $TOK" https://<api>.fly.dev/healthz
  curl -H "Authorization: Bearer $TOK" https://<api>.fly.dev/brokers
  curl -H "Authorization: Bearer $TOK" https://<api>.fly.dev/portfolio/consolidated
  ```
  Confirm the broker/portfolio data returned matches what you see locally.

## Known cosmetic gaps (core-only scope — not blockers)

Since only `api` + `web` are deployed:
- `ProductNav` (`web/src/components/AppShell.tsx` → `ProductNav.tsx`) always
  shows "Mutual Funds" / "Investments" / "Assets" tabs on every page — these
  route to static placeholder pages in the web app itself (not the
  microservices), so they won't error, just show inert "coming soon" content.
- The "Portfolio Onboarding" sidebar link (`/import/onboarding`) calls the
  `onboarding` microservice directly (`web/src/lib/services.ts`'s
  `SERVICES.onboarding`, defaults to `http://localhost:3004` if
  `VITE_ONBOARDING_URL` isn't set). Since that service isn't deployed, every
  action in that wizard will fail with an inline error (not a crash, but
  unusable). If this bothers you, it's a one-line fix to hide that sidebar
  link — flag if you'd like it addressed as a follow-up.
- The `/import/excel` flow (Excel upload) is unaffected — it talks to the
  core API, not a microservice.

## Verification

1. `services/api`: `npx jest` and `npx tsc --noEmit` pass before deploying.
2. `web`: `npx vitest run` and `npx tsc --noEmit` pass before deploying.
3. `docker build` succeeds locally for `services/api` (catches the
   `@tickernest/common` workspace question above before it fails on Fly).
4. Post-deploy: `/healthz` returns healthy, login on the deployed web app
   with your existing account, and confirm your real holdings/watchlist data
   (not empty state) renders on `/dashboard` and `/portfolio`.
5. Confirm CORS works end-to-end (no browser console CORS errors) once
   `WEB_ORIGIN` on Fly matches the final Vercel domain.
