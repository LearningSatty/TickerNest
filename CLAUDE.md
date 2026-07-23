# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TickerNest is a personal investing OS — multi-broker holdings, watchlists, sold-shares journal, realtime quote ticks. Monorepo managed by Turborepo.

## Commands

### Development
```bash
npm run dev:api          # NestJS API with --watch (port 3000)
npm run dev:web          # Vite dev server for React frontend
npm run dev:mf           # Mutual fund microservice
npm run dev:intl         # International holdings microservice
npm run dev:physical     # Physical assets microservice
```

### Testing
```bash
# API (Jest, rootDir is src/, test files: *.spec.ts)
cd services/api && npx jest                    # all tests
cd services/api && npx jest --testPathPattern=quote  # single module

# Web (Vitest)
cd web && npx vitest run                       # all tests
cd web && npx vitest run src/lib/__tests__/format  # single file

# Typecheck
cd web && npx tsc --noEmit
cd services/api && npx tsc --noEmit
npm run typecheck        # all packages via turbo
```

### Database
```bash
cd services/api && DATABASE_URL=<url> npx ts-node src/scripts/migrate.ts
```
Migrations are sequential SQL files in `services/api/db/migrations/` (prefix `0001_`, `0002_`, etc.).

## Architecture

### Monorepo Layout
```
services/api/     — NestJS + TypeScript + Postgres (Supabase) + Redis (Upstash)
services/mf/      — Mutual fund microservice
services/intl/    — International holdings
services/physical/ — Physical assets
web/              — React 18 + Vite + TanStack Query + Tailwind CSS
packages/         — Shared packages (e.g. @tickernest/common)
```

### Backend (services/api)
- **NestJS** with module-per-domain: `auth/`, `broker/`, `holding/`, `market/`, `portfolio/`, `quote/`, `watchlist/`, `notes/`, `events/`, `realtime/`
- **QuoteCache** (`quote/quote.cache.ts`): read-through Redis cache (5s TTL market hours, 60s otherwise). Single source of LTP for all services.
- **QuoteProvider** (`common/providers/quote.provider.ts`): abstract class backed by Yahoo Finance. Handles search, batch quotes, and ticker meta enrichment.
- **Realtime**: WebSocket gateway via Socket.IO; `portfolio-listener.ts` pushes price updates to connected clients.
- **Auth**: Supabase JWT validation via middleware. All endpoints require Bearer token from `sessionStorage('tn:jwt')`.
- **Money type**: All financial values use `Decimal.js` (imported as `D`) — never `Number` for money.

### Frontend (web/)
- **Routing**: React Router v6, nested under `AppShell` (layout with collapsible sidebar + market strip).
- **Auth gate**: `Gate` component redirects to `/login` if no Supabase session.
- **Theming**: CSS custom properties in `index.css` (`:root` = dark, `[data-theme="light"]`). Tailwind colors reference these via `rgb(var(...) / <alpha-value>)`. Theme toggled by `ThemeProvider` in `lib/theme.tsx`.
- **API client**: `lib/api.ts` — thin fetch wrapper, attaches JWT, adds Idempotency-Key for mutations.
- **State**: TanStack Query for server state; Zustand available but sparingly used; most user preferences in `localStorage` with `tn:` prefix.
- **Settings page** (`pages/Settings.tsx`): VS Code-style split layout (sidebar tree + content panel). Exports `getMarketCards()` and `MarketCard` type consumed by `MarketStrip.tsx`.
- **MarketStrip** (`components/MarketStrip.tsx`): reads enabled cards from `getMarketCards()`, fetches quotes from `/market/snapshot` + individual `/quotes/:ticker` for custom cards not in the backend's fixed list.

### Key Conventions
- Path alias: `@/` maps to `web/src/` (configured in tsconfig and Vite).
- CSS component classes: `.card` and `.chip` defined in `@layer components` in `index.css`.
- Custom font size: `text-2xs` (0.6875rem) for compact UI elements.
- localStorage keys are prefixed `tn:` (e.g. `tn:theme`, `tn:nav-collapsed`, `tn:market-cards`).
- Format utilities in `lib/format.ts`: `formatMoney`, `formatSignedMoney`, `formatPct`, `trendClass` — always use these, never raw `Number.toFixed()`.

### Deploy Stack
- **Supabase**: Postgres + Auth + Storage (free tier, ap-south-1)
- **Upstash**: Redis (quote cache)
- **Fly.io**: API hosting (release_command runs migrations)
- **Vercel**: Web frontend
