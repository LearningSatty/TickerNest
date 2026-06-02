# TickerNest Microservices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 3 independent microservices (mf, intl, physical) in a Turborepo monorepo with a shared auth/utility package, gateway aggregation in the existing API, and a product-switcher UI.

**Architecture:** Monorepo with `packages/common` (shared auth + utils), 3 new NestJS services under `services/`, existing `api` and `web` migrated into the monorepo. Each service has its own Supabase DB. The existing `api` doubles as a gateway for `/net-worth` aggregation via Fly internal networking.

**Tech Stack:** NestJS 10, TypeScript 5.5, Turborepo, npm workspaces, Postgres (Supabase), Redis (Upstash/BullMQ), Zod, Decimal.js, Fly.io, React 18 + Vite + TanStack Query + React Router 6.

---

## Phase 1: Monorepo Foundation + Shared Package

### Task 1: Initialize Turborepo monorepo structure

**Files:**
- Create: `package.json` (workspace root)
- Create: `turbo.json`
- Create: `.nvmrc`
- Create: `.gitignore`
- Move: `api/` → `services/api/`
- Move: `web/` → `web/` (stays at root)
- Move: `android/` → `android/` (stays at root)

- [ ] **Step 1: Create workspace root package.json**

```json
{
  "name": "tickernest",
  "private": true,
  "workspaces": [
    "packages/*",
    "services/*",
    "web"
  ],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "dev:api": "turbo run start:dev --filter=tickernest-api",
    "dev:mf": "turbo run start:dev --filter=tickernest-mf",
    "dev:intl": "turbo run start:dev --filter=tickernest-intl",
    "dev:physical": "turbo run start:dev --filter=tickernest-physical",
    "dev:web": "turbo run dev --filter=tickernest-web"
  },
  "devDependencies": {
    "turbo": "^2.1.0"
  },
  "engines": {
    "node": ">=20.9.0",
    "npm": ">=8.0.0"
  }
}
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "start:dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 3: Create .nvmrc**

```
20
```

- [ ] **Step 4: Move existing api into services/api**

```bash
mkdir -p services
mv api services/api
```

- [ ] **Step 5: Move existing web to root level (already there, just verify)**

Verify `web/` is at root. No move needed — it stays at `TickerNest/web/`.

- [ ] **Step 6: Update .gitignore at root**

```gitignore
node_modules/
dist/
.env
.env.local
*.tsbuildinfo
.turbo/
coverage/
```

- [ ] **Step 7: Install turbo and verify workspace**

```bash
cd /Users/satish.verma/.agents/artifacts/TickerNest
npm install
npx turbo --version
```

Expected: Turbo version prints, no errors.

- [ ] **Step 8: Commit**

```bash
git init
git add .
git commit -m "chore: initialize turborepo monorepo structure"
```

---

### Task 2: Extract @tickernest/common shared package

**Files:**
- Create: `packages/common/package.json`
- Create: `packages/common/tsconfig.json`
- Create: `packages/common/src/index.ts`
- Create: `packages/common/src/auth/jwt.middleware.ts`
- Create: `packages/common/src/auth/jwt.ts`
- Create: `packages/common/src/auth/jwks.service.ts`
- Create: `packages/common/src/auth/user-sync.service.ts`
- Create: `packages/common/src/db/db.module.ts`
- Create: `packages/common/src/db/db.service.ts`
- Create: `packages/common/src/types/money.ts`
- Create: `packages/common/src/types/summary.dto.ts`
- Create: `packages/common/src/types/pagination.dto.ts`
- Create: `packages/common/src/crypto.ts`
- Create: `packages/common/src/idempotency.ts`
- Create: `packages/common/src/idempotency.pg.ts`
- Create: `packages/common/src/zod.pipe.ts`
- Create: `packages/common/src/__tests__/money.spec.ts`

- [ ] **Step 1: Create packages/common/package.json**

```json
{
  "name": "@tickernest/common",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -b",
    "test": "jest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/config": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "decimal.js": "^10.4.3",
    "pg": "^8.12.0",
    "reflect-metadata": "^0.2.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.14.0",
    "@types/pg": "^8.20.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.5.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Create packages/common/tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "lib": ["ES2022"]
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.spec.ts"]
}
```

- [ ] **Step 3: Copy auth files from services/api/src/auth/ into packages/common/src/auth/**

Copy these files verbatim (they are already generic):
- `jwt.middleware.ts`
- `jwt.ts`
- `jwks.service.ts`
- `user-sync.service.ts`

The only change: `user-sync.service.ts` should import `DbService` from `../db/db.service` (relative within common package).

- [ ] **Step 4: Copy utility files into packages/common/src/**

Copy these verbatim from `services/api/src/common/`:
- `db.module.ts` → `packages/common/src/db/db.module.ts`
- `db.service.ts` → `packages/common/src/db/db.service.ts`
- `types/money.ts` → `packages/common/src/types/money.ts`
- `crypto.ts` → `packages/common/src/crypto.ts`
- `idempotency.ts` → `packages/common/src/idempotency.ts`
- `idempotency.pg.ts` → `packages/common/src/idempotency.pg.ts`
- `zod.pipe.ts` → `packages/common/src/zod.pipe.ts`

- [ ] **Step 5: Create summary DTO**

```typescript
// packages/common/src/types/summary.dto.ts
export interface ServiceSummary {
  totalInvested: string;
  currentValue: string;
  totalPL: string;
  plPct: number;
  asOf: string;
  breakdown: Record<string, {
    invested: string;
    current: string;
    pl: string;
  }>;
}
```

- [ ] **Step 6: Create pagination DTO**

```typescript
// packages/common/src/types/pagination.dto.ts
export interface PaginationQuery {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}
```

- [ ] **Step 7: Create barrel export**

```typescript
// packages/common/src/index.ts
export { JwtMiddleware } from './auth/jwt.middleware';
export { verifyJwtAsync } from './auth/jwt';
export { JwksService } from './auth/jwks.service';
export { UserSyncService } from './auth/user-sync.service';
export { DbModule } from './db/db.module';
export { DbService, type Tx } from './db/db.service';
export { D, ZERO, isZero, sum, weightedAvg, toWire, type Money } from './types/money';
export type { ServiceSummary } from './types/summary.dto';
export type { PaginationQuery, PaginatedResponse } from './types/pagination.dto';
export { encryptPii, decryptPii, type EncryptedField } from './crypto';
export { IdempotencyService, type IdempotencyStore, type IdempotencyResolution } from './idempotency';
export { PgIdempotencyStore } from './idempotency.pg';
export { ZodValidationPipe } from './zod.pipe';
```

- [ ] **Step 8: Write a test for money utilities**

```typescript
// packages/common/src/__tests__/money.spec.ts
import { D, sum, weightedAvg, toWire, ZERO } from '../types/money';

describe('money utilities', () => {
  it('D() parses string to Decimal', () => {
    expect(D('123.4567').toString()).toBe('123.4567');
  });

  it('sum() adds decimals', () => {
    expect(sum([D('10.5'), D('20.3'), D('5.2')]).toString()).toBe('36');
  });

  it('weightedAvg() computes correctly', () => {
    const pairs = [
      { qty: D('10'), price: D('100') },
      { qty: D('20'), price: D('150') },
    ];
    // (10*100 + 20*150) / (10+20) = 4000/30 = 133.3333...
    expect(weightedAvg(pairs).toFixed(4)).toBe('133.3333');
  });

  it('weightedAvg() returns ZERO for empty qty', () => {
    const pairs = [{ qty: D('0'), price: D('100') }];
    expect(weightedAvg(pairs).eq(ZERO)).toBe(true);
  });

  it('toWire() formats to 4 decimal places', () => {
    expect(toWire(D('123.456789'))).toBe('123.4568');
  });
});
```

- [ ] **Step 9: Run test**

```bash
cd packages/common && npx jest
```

Expected: 5 tests pass.

- [ ] **Step 10: Build the package**

```bash
cd packages/common && npx tsc -b
```

Expected: `dist/` folder created with `.js` + `.d.ts` files.

- [ ] **Step 11: Update services/api to depend on @tickernest/common**

In `services/api/package.json`, add dependency:
```json
"@tickernest/common": "workspace:*"
```

Update imports in `services/api/src/app.module.ts` and all files that reference `./common/` or `./auth/` to import from `@tickernest/common` instead. Keep files in `services/api/src/common/` and `services/api/src/auth/` as re-exports initially to avoid breaking all imports at once.

- [ ] **Step 12: Verify existing API still works**

```bash
cd services/api && npx jest
```

Expected: All 106 existing tests pass.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: extract @tickernest/common shared package with auth, db, money, crypto utilities"
```

---

### Task 3: Create NestJS service scaffold template

**Files:**
- Create: `services/mf/package.json`
- Create: `services/mf/tsconfig.json`
- Create: `services/mf/nest-cli.json`
- Create: `services/mf/src/main.ts`
- Create: `services/mf/src/app.module.ts`
- Create: `services/mf/src/health/health.controller.ts`
- Create: `services/mf/Dockerfile`
- Create: `services/mf/fly.toml`
- Create: `services/mf/.env.example`

This task creates the `mf` service scaffold. Tasks 4 and 5 clone it for `intl` and `physical`.

- [ ] **Step 1: Create services/mf/package.json**

```json
{
  "name": "tickernest-mf",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "test": "jest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/config": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@tickernest/common": "workspace:*",
    "bullmq": "^5.10.0",
    "ioredis": "^5.4.0",
    "pg": "^8.12.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.0",
    "@nestjs/testing": "^10.4.0",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.14.0",
    "@types/pg": "^8.20.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.5.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Create services/mf/tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "lib": ["ES2022"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../../packages/common" }]
}
```

- [ ] **Step 3: Create services/mf/nest-cli.json**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 4: Create services/mf/src/main.ts**

```typescript
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3001;
  app.enableCors({
    origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });
  await app.listen(port);
  Logger.log(`tickernest-mf listening on :${port}`, 'Bootstrap');
}
bootstrap();
```

- [ ] **Step 5: Create services/mf/src/app.module.ts**

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule, JwtMiddleware, JwksService, UserSyncService } from '@tickernest/common';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule],
  controllers: [HealthController],
  providers: [JwksService, UserSyncService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JwtMiddleware)
      .exclude('health')
      .forRoutes('*');
  }
}
```

- [ ] **Step 6: Create services/mf/src/health/health.controller.ts**

```typescript
import { Controller, Get } from '@nestjs/common';
import { DbService } from '@tickernest/common';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Get()
  async check() {
    try {
      await this.db.query('SELECT 1');
      return { ok: true, db: true, service: 'tickernest-mf' };
    } catch {
      return { ok: false, db: false, service: 'tickernest-mf' };
    }
  }
}
```

- [ ] **Step 7: Create services/mf/.env.example**

```env
PORT=3001
DATABASE_URL=postgresql://postgres:password@localhost:5432/tickernest_mf
REDIS_URL=redis://localhost:6379
SUPABASE_JWT_SECRET=your-jwt-secret
WEB_ORIGIN=http://localhost:5173
```

- [ ] **Step 8: Create services/mf/Dockerfile**

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json turbo.json ./
COPY packages/common/package.json packages/common/
COPY services/mf/package.json services/mf/
RUN npm install --workspace=packages/common --workspace=services/mf
COPY packages/common packages/common
COPY services/mf services/mf
RUN npx turbo run build --filter=tickernest-mf

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/mf/dist ./dist
COPY --from=builder /app/services/mf/package.json ./
COPY --from=builder /app/packages/common/dist ./node_modules/@tickernest/common/dist
COPY --from=builder /app/packages/common/package.json ./node_modules/@tickernest/common/
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

- [ ] **Step 9: Create services/mf/fly.toml**

```toml
app = "tickernest-mf"
primary_region = "bom"

[build]
  dockerfile = "../../Dockerfile.mf"

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

- [ ] **Step 10: Verify service builds and health endpoint works**

```bash
cd services/mf && npm install && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold mf service with health endpoint, Dockerfile, fly.toml"
```

---

### Task 4: Clone scaffold for intl service

**Files:**
- Create: `services/intl/` (same structure as mf, with port 3002 and name `tickernest-intl`)

- [ ] **Step 1: Copy mf scaffold to intl**

```bash
cp -r services/mf services/intl
```

- [ ] **Step 2: Update services/intl/package.json**

Change `name` to `"tickernest-intl"`.

- [ ] **Step 3: Update services/intl/src/main.ts**

Change port default to `3002` and log message to `tickernest-intl`.

- [ ] **Step 4: Update services/intl/src/health/health.controller.ts**

Change service name to `'tickernest-intl'`.

- [ ] **Step 5: Update services/intl/fly.toml**

Change `app` to `"tickernest-intl"`, `internal_port` to `3002`, `PORT` env to `"3002"`.

- [ ] **Step 6: Update services/intl/.env.example**

Change `PORT=3002` and `DATABASE_URL` to `tickernest_intl`.

- [ ] **Step 7: Typecheck**

```bash
cd services/intl && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold intl service (US investing, FX, crypto)"
```

---

### Task 5: Clone scaffold for physical service

**Files:**
- Create: `services/physical/` (same structure, port 3003, name `tickernest-physical`)

- [ ] **Step 1: Copy mf scaffold to physical**

```bash
cp -r services/mf services/physical
```

- [ ] **Step 2: Update services/physical/package.json**

Change `name` to `"tickernest-physical"`.

- [ ] **Step 3: Update services/physical/src/main.ts**

Change port default to `3003` and log message to `tickernest-physical`.

- [ ] **Step 4: Update services/physical/src/health/health.controller.ts**

Change service name to `'tickernest-physical'`.

- [ ] **Step 5: Update services/physical/fly.toml**

Change `app` to `"tickernest-physical"`, `internal_port` to `3003`, `PORT` env to `"3003"`.

- [ ] **Step 6: Update services/physical/.env.example**

Change `PORT=3003` and `DATABASE_URL` to `tickernest_physical`.

- [ ] **Step 7: Typecheck**

```bash
cd services/physical && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold physical service (gold, manual assets)"
```

---

## Phase 2: Mutual Funds Service (`mf`)

### Task 6: Database migration script for mf service

**Files:**
- Create: `services/mf/src/scripts/migrate.ts`

- [ ] **Step 1: Write migration script**

```typescript
// services/mf/src/scripts/migrate.ts
import { Pool } from 'pg';

const DDL = `
-- auth.uid() helper for RLS (matches Supabase pattern)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mutual_fund (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
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

CREATE TABLE IF NOT EXISTS mf_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  fund_id UUID NOT NULL REFERENCES mutual_fund(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','SWITCH_IN','SWITCH_OUT','STP_IN','STP_OUT','DIVIDEND')),
  units NUMERIC(20,6) NOT NULL,
  nav NUMERIC(20,4) NOT NULL,
  amount NUMERIC(20,4) NOT NULL,
  transacted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sip_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  fund_id UUID REFERENCES mutual_fund(id),
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

CREATE TABLE IF NOT EXISTS ulip (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
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

CREATE TABLE IF NOT EXISTS mf_nav_history (
  scheme_code TEXT NOT NULL,
  date DATE NOT NULL,
  nav NUMERIC(20,4) NOT NULL,
  PRIMARY KEY (scheme_code, date)
);

CREATE TABLE IF NOT EXISTS idempotency_record (
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  endpoint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- RLS
ALTER TABLE mutual_fund ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_funds ON mutual_fund USING (user_id = auth.uid());

ALTER TABLE mf_transaction ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_mf_tx ON mf_transaction USING (user_id = auth.uid());

ALTER TABLE sip_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_sip ON sip_plan USING (user_id = auth.uid());

ALTER TABLE ulip ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_ulip ON ulip USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mf_user ON mutual_fund(user_id);
CREATE INDEX IF NOT EXISTS idx_mf_tx_fund ON mf_transaction(fund_id);
CREATE INDEX IF NOT EXISTS idx_sip_user ON sip_plan(user_id);
CREATE INDEX IF NOT EXISTS idx_nav_scheme ON mf_nav_history(scheme_code, date DESC);
`;

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(DDL);
    console.log('Migration complete: tickernest-mf');
  } finally {
    await pool.end();
  }
}

migrate().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(mf): add database migration script with full DDL + RLS"
```

---

### Task 7: Mutual Fund CRUD — repository + service + controller

**Files:**
- Create: `services/mf/src/fund/fund.repository.ts`
- Create: `services/mf/src/fund/fund.service.ts`
- Create: `services/mf/src/fund/fund.controller.ts`
- Create: `services/mf/src/fund/fund.dto.ts`
- Create: `services/mf/src/fund/__tests__/fund.service.spec.ts`

- [ ] **Step 1: Write the fund DTO (Zod schemas)**

```typescript
// services/mf/src/fund/fund.dto.ts
import { z } from 'zod';

export const CreateFundDto = z.object({
  schemeCode: z.string().min(1),
  fundName: z.string().min(1),
  amc: z.string().optional(),
  category: z.enum(['EQUITY', 'DEBT', 'HYBRID', 'ELSS', 'LIQUID', 'INDEX', 'OTHER']).optional(),
  goal: z.string().optional(),
  units: z.string().regex(/^\d+(\.\d+)?$/),
  avgNav: z.string().regex(/^\d+(\.\d+)?$/),
});

export const UpdateFundDto = z.object({
  units: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  avgNav: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  currentNav: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  goal: z.string().optional(),
});

export type CreateFundInput = z.infer<typeof CreateFundDto>;
export type UpdateFundInput = z.infer<typeof UpdateFundDto>;
```

- [ ] **Step 2: Write the fund repository**

```typescript
// services/mf/src/fund/fund.repository.ts
import { Injectable } from '@nestjs/common';
import { DbService, type Tx } from '@tickernest/common';

export interface FundRow {
  id: string;
  user_id: string;
  scheme_code: string;
  fund_name: string;
  amc: string | null;
  category: string | null;
  goal: string | null;
  units: string;
  avg_nav: string;
  current_nav: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class FundRepository {
  constructor(private readonly db: DbService) {}

  async findAllByUser(userId: string): Promise<FundRow[]> {
    const { rows } = await this.db.query<FundRow>(
      `SELECT * FROM mutual_fund WHERE user_id = $1 ORDER BY fund_name`,
      [userId],
    );
    return rows;
  }

  async findById(userId: string, id: string): Promise<FundRow | null> {
    const { rows } = await this.db.query<FundRow>(
      `SELECT * FROM mutual_fund WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async upsert(userId: string, data: {
    schemeCode: string;
    fundName: string;
    amc?: string;
    category?: string;
    goal?: string;
    units: string;
    avgNav: string;
  }, tx?: Tx): Promise<FundRow> {
    const client = tx ?? this.db;
    const { rows } = await (client as any).query(
      `INSERT INTO mutual_fund (user_id, scheme_code, fund_name, amc, category, goal, units, avg_nav)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, scheme_code)
       DO UPDATE SET fund_name = EXCLUDED.fund_name, amc = EXCLUDED.amc,
                     category = EXCLUDED.category, goal = EXCLUDED.goal,
                     units = EXCLUDED.units, avg_nav = EXCLUDED.avg_nav,
                     updated_at = NOW()
       RETURNING *`,
      [userId, data.schemeCode, data.fundName, data.amc ?? null,
       data.category ?? null, data.goal ?? null, data.units, data.avgNav],
    );
    return rows[0]!;
  }

  async update(userId: string, id: string, data: {
    units?: string;
    avgNav?: string;
    currentNav?: string;
    goal?: string;
  }): Promise<FundRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.units !== undefined) { sets.push(`units = $${idx++}`); params.push(data.units); }
    if (data.avgNav !== undefined) { sets.push(`avg_nav = $${idx++}`); params.push(data.avgNav); }
    if (data.currentNav !== undefined) { sets.push(`current_nav = $${idx++}`); params.push(data.currentNav); }
    if (data.goal !== undefined) { sets.push(`goal = $${idx++}`); params.push(data.goal); }

    if (sets.length === 0) return this.findById(userId, id);

    sets.push(`updated_at = NOW()`);
    params.push(id, userId);

    const { rows } = await this.db.query<FundRow>(
      `UPDATE mutual_fund SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM mutual_fund WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
```

- [ ] **Step 3: Write the fund service**

```typescript
// services/mf/src/fund/fund.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { D, toWire, sum, type Money } from '@tickernest/common';
import { FundRepository, type FundRow } from './fund.repository';
import type { CreateFundInput, UpdateFundInput } from './fund.dto';

export interface FundView {
  id: string;
  schemeCode: string;
  fundName: string;
  amc: string | null;
  category: string | null;
  goal: string | null;
  units: string;
  avgNav: string;
  currentNav: string | null;
  invested: string;
  currentValue: string | null;
  pl: string | null;
  plPct: number | null;
}

@Injectable()
export class FundService {
  constructor(private readonly repo: FundRepository) {}

  async list(userId: string): Promise<FundView[]> {
    const rows = await this.repo.findAllByUser(userId);
    return rows.map(this.toView);
  }

  async get(userId: string, id: string): Promise<FundView> {
    const row = await this.repo.findById(userId, id);
    if (!row) throw new NotFoundException('Fund not found');
    return this.toView(row);
  }

  async create(userId: string, input: CreateFundInput): Promise<FundView> {
    const row = await this.repo.upsert(userId, input);
    return this.toView(row);
  }

  async update(userId: string, id: string, input: UpdateFundInput): Promise<FundView> {
    const row = await this.repo.update(userId, id, input);
    if (!row) throw new NotFoundException('Fund not found');
    return this.toView(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.delete(userId, id);
    if (!deleted) throw new NotFoundException('Fund not found');
  }

  private toView(row: FundRow): FundView {
    const units = D(row.units);
    const avgNav = D(row.avg_nav);
    const invested = units.mul(avgNav);
    const currentNav = row.current_nav ? D(row.current_nav) : null;
    const currentValue = currentNav ? units.mul(currentNav) : null;
    const pl = currentValue ? currentValue.sub(invested) : null;
    const plPct = pl && !invested.isZero() ? pl.div(invested).mul(100).toNumber() : null;

    return {
      id: row.id,
      schemeCode: row.scheme_code,
      fundName: row.fund_name,
      amc: row.amc,
      category: row.category,
      goal: row.goal,
      units: row.units,
      avgNav: row.avg_nav,
      currentNav: row.current_nav,
      invested: toWire(invested),
      currentValue: currentValue ? toWire(currentValue) : null,
      pl: pl ? toWire(pl) : null,
      plPct: plPct !== null ? Math.round(plPct * 100) / 100 : null,
    };
  }
}
```

- [ ] **Step 4: Write the fund controller**

```typescript
// services/mf/src/fund/fund.controller.ts
import {
  Body, Controller, Delete, Get, Param, Post, Put, Req, UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from '@tickernest/common';
import type { Request } from 'express';
import { FundService } from './fund.service';
import { CreateFundDto, UpdateFundDto } from './fund.dto';

@Controller('funds')
export class FundController {
  constructor(private readonly svc: FundService) {}

  @Get()
  list(@Req() req: Request) {
    return this.svc.list(req.user!.id);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.svc.get(req.user!.id, id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateFundDto))
  create(@Req() req: Request, @Body() body: any) {
    return this.svc.create(req.user!.id, body);
  }

  @Put(':id')
  @UsePipes(new ZodValidationPipe(UpdateFundDto))
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(req.user!.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.svc.remove(req.user!.id, id);
  }
}
```

- [ ] **Step 5: Write the failing test for FundService**

```typescript
// services/mf/src/fund/__tests__/fund.service.spec.ts
import { FundService } from '../fund.service';
import { FundRepository, type FundRow } from '../fund.repository';

const mockRow: FundRow = {
  id: '1',
  user_id: 'u1',
  scheme_code: '119551',
  fund_name: 'HDFC Flexi Cap Fund',
  amc: 'HDFC',
  category: 'EQUITY',
  goal: 'wealth',
  units: '100.5000',
  avg_nav: '25.5000',
  current_nav: '30.0000',
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

describe('FundService', () => {
  let service: FundService;
  let repo: jest.Mocked<FundRepository>;

  beforeEach(() => {
    repo = {
      findAllByUser: jest.fn(),
      findById: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;
    service = new FundService(repo);
  });

  it('list returns fund views with computed P/L', async () => {
    repo.findAllByUser.mockResolvedValue([mockRow]);
    const result = await service.list('u1');
    expect(result).toHaveLength(1);
    expect(result[0]!.invested).toBe('2562.7500');       // 100.5 * 25.5
    expect(result[0]!.currentValue).toBe('3015.0000');   // 100.5 * 30
    expect(result[0]!.pl).toBe('452.2500');              // 3015 - 2562.75
    expect(result[0]!.plPct).toBeCloseTo(17.64, 1);
  });

  it('get throws NotFoundException when fund not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.get('u1', 'nonexistent')).rejects.toThrow('Fund not found');
  });

  it('create calls repo.upsert and returns view', async () => {
    repo.upsert.mockResolvedValue(mockRow);
    const result = await service.create('u1', {
      schemeCode: '119551',
      fundName: 'HDFC Flexi Cap Fund',
      units: '100.5',
      avgNav: '25.5',
    });
    expect(result.schemeCode).toBe('119551');
    expect(repo.upsert).toHaveBeenCalledWith('u1', expect.objectContaining({ schemeCode: '119551' }));
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd services/mf && npx jest
```

Expected: 3 tests pass.

- [ ] **Step 7: Register fund module in app.module.ts**

Update `services/mf/src/app.module.ts`:
```typescript
import { FundController } from './fund/fund.controller';
import { FundService } from './fund/fund.service';
import { FundRepository } from './fund/fund.repository';

// Add to controllers: FundController
// Add to providers: FundRepository, FundService
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(mf): add mutual fund CRUD (repository, service, controller, tests)"
```

---

### Task 8: SIP Plan CRUD

**Files:**
- Create: `services/mf/src/sip/sip.repository.ts`
- Create: `services/mf/src/sip/sip.service.ts`
- Create: `services/mf/src/sip/sip.controller.ts`
- Create: `services/mf/src/sip/sip.dto.ts`
- Create: `services/mf/src/sip/__tests__/sip.service.spec.ts`

- [ ] **Step 1: Write SIP DTO**

```typescript
// services/mf/src/sip/sip.dto.ts
import { z } from 'zod';

export const CreateSipDto = z.object({
  fundName: z.string().min(1),
  schemeCode: z.string().optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  frequency: z.enum(['MONTHLY', 'WEEKLY', 'QUARTERLY']).default('MONTHLY'),
  sipDate: z.number().int().min(1).max(28).optional(),
  startDate: z.string(), // ISO date
  endDate: z.string().optional(),
});

export const UpdateSipDto = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
  endDate: z.string().optional(),
});

export type CreateSipInput = z.infer<typeof CreateSipDto>;
export type UpdateSipInput = z.infer<typeof UpdateSipDto>;
```

- [ ] **Step 2: Write SIP repository**

```typescript
// services/mf/src/sip/sip.repository.ts
import { Injectable } from '@nestjs/common';
import { DbService } from '@tickernest/common';

export interface SipRow {
  id: string;
  user_id: string;
  fund_id: string | null;
  fund_name: string;
  scheme_code: string | null;
  amount: string;
  frequency: string;
  sip_date: number | null;
  start_date: string;
  end_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class SipRepository {
  constructor(private readonly db: DbService) {}

  async findAllByUser(userId: string): Promise<SipRow[]> {
    const { rows } = await this.db.query<SipRow>(
      `SELECT * FROM sip_plan WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  async findById(userId: string, id: string): Promise<SipRow | null> {
    const { rows } = await this.db.query<SipRow>(
      `SELECT * FROM sip_plan WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async create(userId: string, data: {
    fundName: string;
    schemeCode?: string;
    amount: string;
    frequency: string;
    sipDate?: number;
    startDate: string;
    endDate?: string;
  }): Promise<SipRow> {
    const { rows } = await this.db.query<SipRow>(
      `INSERT INTO sip_plan (user_id, fund_name, scheme_code, amount, frequency, sip_date, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, data.fundName, data.schemeCode ?? null, data.amount,
       data.frequency, data.sipDate ?? null, data.startDate, data.endDate ?? null],
    );
    return rows[0]!;
  }

  async update(userId: string, id: string, data: {
    amount?: string;
    status?: string;
    endDate?: string;
  }): Promise<SipRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.amount !== undefined) { sets.push(`amount = $${idx++}`); params.push(data.amount); }
    if (data.status !== undefined) { sets.push(`status = $${idx++}`); params.push(data.status); }
    if (data.endDate !== undefined) { sets.push(`end_date = $${idx++}`); params.push(data.endDate); }

    if (sets.length === 0) return this.findById(userId, id);
    sets.push(`updated_at = NOW()`);
    params.push(id, userId);

    const { rows } = await this.db.query<SipRow>(
      `UPDATE sip_plan SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM sip_plan WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
```

- [ ] **Step 3: Write SIP service**

```typescript
// services/mf/src/sip/sip.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { SipRepository, type SipRow } from './sip.repository';
import type { CreateSipInput, UpdateSipInput } from './sip.dto';

@Injectable()
export class SipService {
  constructor(private readonly repo: SipRepository) {}

  async list(userId: string) {
    return this.repo.findAllByUser(userId);
  }

  async get(userId: string, id: string) {
    const row = await this.repo.findById(userId, id);
    if (!row) throw new NotFoundException('SIP plan not found');
    return row;
  }

  async create(userId: string, input: CreateSipInput) {
    return this.repo.create(userId, input);
  }

  async update(userId: string, id: string, input: UpdateSipInput) {
    const row = await this.repo.update(userId, id, input);
    if (!row) throw new NotFoundException('SIP plan not found');
    return row;
  }

  async remove(userId: string, id: string) {
    const deleted = await this.repo.delete(userId, id);
    if (!deleted) throw new NotFoundException('SIP plan not found');
  }
}
```

- [ ] **Step 4: Write SIP controller**

```typescript
// services/mf/src/sip/sip.controller.ts
import {
  Body, Controller, Delete, Get, Param, Post, Put, Req, UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from '@tickernest/common';
import type { Request } from 'express';
import { SipService } from './sip.service';
import { CreateSipDto, UpdateSipDto } from './sip.dto';

@Controller('sip')
export class SipController {
  constructor(private readonly svc: SipService) {}

  @Get()
  list(@Req() req: Request) { return this.svc.list(req.user!.id); }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) { return this.svc.get(req.user!.id, id); }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateSipDto))
  create(@Req() req: Request, @Body() body: any) { return this.svc.create(req.user!.id, body); }

  @Put(':id')
  @UsePipes(new ZodValidationPipe(UpdateSipDto))
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(req.user!.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) { return this.svc.remove(req.user!.id, id); }
}
```

- [ ] **Step 5: Write SIP test**

```typescript
// services/mf/src/sip/__tests__/sip.service.spec.ts
import { SipService } from '../sip.service';
import { SipRepository } from '../sip.repository';

describe('SipService', () => {
  let service: SipService;
  let repo: jest.Mocked<SipRepository>;

  beforeEach(() => {
    repo = { findAllByUser: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() } as any;
    service = new SipService(repo);
  });

  it('create delegates to repo', async () => {
    const input = { fundName: 'HDFC Top 100', amount: '5000', frequency: 'MONTHLY' as const, startDate: '2024-01-01' };
    repo.create.mockResolvedValue({ id: '1', user_id: 'u1', fund_id: null, fund_name: 'HDFC Top 100', scheme_code: null, amount: '5000', frequency: 'MONTHLY', sip_date: null, start_date: '2024-01-01', end_date: null, status: 'ACTIVE', created_at: '', updated_at: '' });
    const result = await service.create('u1', input);
    expect(result.fund_name).toBe('HDFC Top 100');
    expect(result.status).toBe('ACTIVE');
  });

  it('update throws when not found', async () => {
    repo.update.mockResolvedValue(null);
    await expect(service.update('u1', 'x', { status: 'PAUSED' })).rejects.toThrow('SIP plan not found');
  });
});
```

- [ ] **Step 6: Run tests**

```bash
cd services/mf && npx jest
```

Expected: All tests pass.

- [ ] **Step 7: Register in app.module.ts**

Add `SipController`, `SipService`, `SipRepository` to the module.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(mf): add SIP plan CRUD (repository, service, controller, tests)"
```

---

### Task 9: ULIP CRUD

**Files:**
- Create: `services/mf/src/ulip/ulip.repository.ts`
- Create: `services/mf/src/ulip/ulip.service.ts`
- Create: `services/mf/src/ulip/ulip.controller.ts`
- Create: `services/mf/src/ulip/ulip.dto.ts`

- [ ] **Step 1: Write ULIP DTO**

```typescript
// services/mf/src/ulip/ulip.dto.ts
import { z } from 'zod';

export const CreateUlipDto = z.object({
  insurer: z.string().min(1),
  planName: z.string().min(1),
  policyNumber: z.string().optional(),
  premium: z.string().regex(/^\d+(\.\d+)?$/),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']).default('YEARLY'),
  fundValue: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  maturityDate: z.string().optional(),
  nominee: z.string().optional(),
});

export const UpdateUlipDto = z.object({
  fundValue: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  maturityDate: z.string().optional(),
  nominee: z.string().optional(),
});

export type CreateUlipInput = z.infer<typeof CreateUlipDto>;
export type UpdateUlipInput = z.infer<typeof UpdateUlipDto>;
```

- [ ] **Step 2: Write ULIP repository (same pattern as SIP)**

```typescript
// services/mf/src/ulip/ulip.repository.ts
import { Injectable } from '@nestjs/common';
import { DbService } from '@tickernest/common';

export interface UlipRow {
  id: string; user_id: string; insurer: string; plan_name: string;
  policy_number: string | null; premium: string; frequency: string;
  fund_value: string | null; maturity_date: string | null; nominee: string | null;
  created_at: string; updated_at: string;
}

@Injectable()
export class UlipRepository {
  constructor(private readonly db: DbService) {}

  async findAllByUser(userId: string): Promise<UlipRow[]> {
    const { rows } = await this.db.query<UlipRow>(
      `SELECT * FROM ulip WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows;
  }

  async findById(userId: string, id: string): Promise<UlipRow | null> {
    const { rows } = await this.db.query<UlipRow>(
      `SELECT * FROM ulip WHERE id = $1 AND user_id = $2`, [id, userId]);
    return rows[0] ?? null;
  }

  async create(userId: string, data: {
    insurer: string; planName: string; policyNumber?: string; premium: string;
    frequency: string; fundValue?: string; maturityDate?: string; nominee?: string;
  }): Promise<UlipRow> {
    const { rows } = await this.db.query<UlipRow>(
      `INSERT INTO ulip (user_id, insurer, plan_name, policy_number, premium, frequency, fund_value, maturity_date, nominee)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [userId, data.insurer, data.planName, data.policyNumber ?? null, data.premium,
       data.frequency, data.fundValue ?? null, data.maturityDate ?? null, data.nominee ?? null]);
    return rows[0]!;
  }

  async update(userId: string, id: string, data: {
    fundValue?: string; maturityDate?: string; nominee?: string;
  }): Promise<UlipRow | null> {
    const sets: string[] = []; const params: unknown[] = []; let idx = 1;
    if (data.fundValue !== undefined) { sets.push(`fund_value = $${idx++}`); params.push(data.fundValue); }
    if (data.maturityDate !== undefined) { sets.push(`maturity_date = $${idx++}`); params.push(data.maturityDate); }
    if (data.nominee !== undefined) { sets.push(`nominee = $${idx++}`); params.push(data.nominee); }
    if (sets.length === 0) return this.findById(userId, id);
    sets.push(`updated_at = NOW()`); params.push(id, userId);
    const { rows } = await this.db.query<UlipRow>(
      `UPDATE ulip SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`, params);
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(`DELETE FROM ulip WHERE id = $1 AND user_id = $2`, [id, userId]);
    return (rowCount ?? 0) > 0;
  }
}
```

- [ ] **Step 3: Write ULIP service + controller (same pattern)**

```typescript
// services/mf/src/ulip/ulip.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { UlipRepository } from './ulip.repository';
import type { CreateUlipInput, UpdateUlipInput } from './ulip.dto';

@Injectable()
export class UlipService {
  constructor(private readonly repo: UlipRepository) {}

  list(userId: string) { return this.repo.findAllByUser(userId); }

  async get(userId: string, id: string) {
    const row = await this.repo.findById(userId, id);
    if (!row) throw new NotFoundException('ULIP not found');
    return row;
  }

  create(userId: string, input: CreateUlipInput) { return this.repo.create(userId, input); }

  async update(userId: string, id: string, input: UpdateUlipInput) {
    const row = await this.repo.update(userId, id, input);
    if (!row) throw new NotFoundException('ULIP not found');
    return row;
  }

  async remove(userId: string, id: string) {
    if (!(await this.repo.delete(userId, id))) throw new NotFoundException('ULIP not found');
  }
}
```

```typescript
// services/mf/src/ulip/ulip.controller.ts
import { Body, Controller, Delete, Get, Param, Post, Put, Req, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from '@tickernest/common';
import type { Request } from 'express';
import { UlipService } from './ulip.service';
import { CreateUlipDto, UpdateUlipDto } from './ulip.dto';

@Controller('ulip')
export class UlipController {
  constructor(private readonly svc: UlipService) {}

  @Get() list(@Req() req: Request) { return this.svc.list(req.user!.id); }
  @Get(':id') get(@Req() req: Request, @Param('id') id: string) { return this.svc.get(req.user!.id, id); }

  @Post() @UsePipes(new ZodValidationPipe(CreateUlipDto))
  create(@Req() req: Request, @Body() body: any) { return this.svc.create(req.user!.id, body); }

  @Put(':id') @UsePipes(new ZodValidationPipe(UpdateUlipDto))
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) { return this.svc.update(req.user!.id, id, body); }

  @Delete(':id') remove(@Req() req: Request, @Param('id') id: string) { return this.svc.remove(req.user!.id, id); }
}
```

- [ ] **Step 4: Register in app.module.ts**

Add `UlipController`, `UlipService`, `UlipRepository`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mf): add ULIP CRUD (repository, service, controller)"
```

---

### Task 10: MF Summary endpoint + NAV poller job

**Files:**
- Create: `services/mf/src/summary/summary.controller.ts`
- Create: `services/mf/src/nav/nav-poller.service.ts`
- Create: `services/mf/src/nav/__tests__/nav-poller.spec.ts`

- [ ] **Step 1: Write summary controller**

```typescript
// services/mf/src/summary/summary.controller.ts
import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { DbService, D, toWire, sum, type ServiceSummary } from '@tickernest/common';

@Controller('summary')
export class SummaryController {
  constructor(private readonly db: DbService) {}

  @Get()
  async getSummary(@Req() req: Request): Promise<ServiceSummary> {
    const userId = req.user!.id;
    const { rows } = await this.db.query<{ units: string; avg_nav: string; current_nav: string | null; category: string | null }>(
      `SELECT units, avg_nav, current_nav, category FROM mutual_fund WHERE user_id = $1 AND units > 0`,
      [userId],
    );

    let totalInvested = D(0);
    let totalCurrent = D(0);
    const breakdown: Record<string, { invested: string; current: string; pl: string }> = {};

    for (const row of rows) {
      const units = D(row.units);
      const invested = units.mul(D(row.avg_nav));
      const current = row.current_nav ? units.mul(D(row.current_nav)) : invested;
      totalInvested = totalInvested.add(invested);
      totalCurrent = totalCurrent.add(current);

      const cat = row.category ?? 'OTHER';
      if (!breakdown[cat]) breakdown[cat] = { invested: '0', current: '0', pl: '0' };
      const b = breakdown[cat]!;
      b.invested = toWire(D(b.invested).add(invested));
      b.current = toWire(D(b.current).add(current));
      b.pl = toWire(D(b.current).sub(D(b.invested)));
    }

    const totalPL = totalCurrent.sub(totalInvested);
    const plPct = totalInvested.isZero() ? 0 : totalPL.div(totalInvested).mul(100).toNumber();

    return {
      totalInvested: toWire(totalInvested),
      currentValue: toWire(totalCurrent),
      totalPL: toWire(totalPL),
      plPct: Math.round(plPct * 100) / 100,
      asOf: new Date().toISOString(),
      breakdown,
    };
  }
}
```

- [ ] **Step 2: Write NAV poller service**

```typescript
// services/mf/src/nav/nav-poller.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService } from '@tickernest/common';

/**
 * Fetches latest NAV for all scheme codes held by users.
 * Runs as a BullMQ cron (daily 23:00 IST) or can be triggered manually.
 * Data source: https://api.mfapi.in/mf/{scheme_code}/latest
 */
@Injectable()
export class NavPollerService implements OnModuleInit {
  private readonly log = new Logger(NavPollerService.name);

  constructor(
    private readonly db: DbService,
    private readonly cfg: ConfigService,
  ) {}

  onModuleInit() {
    // In production, this would be registered as a BullMQ repeatable job.
    // For MVP, we expose it as a callable method.
    this.log.log('NAV poller initialized (call pollAll() to refresh)');
  }

  async pollAll(): Promise<{ updated: number; errors: number }> {
    const { rows } = await this.db.query<{ scheme_code: string }>(
      `SELECT DISTINCT scheme_code FROM mutual_fund WHERE units > 0`,
    );

    let updated = 0;
    let errors = 0;

    for (const { scheme_code } of rows) {
      try {
        const nav = await this.fetchLatestNav(scheme_code);
        if (nav !== null) {
          await this.db.query(
            `UPDATE mutual_fund SET current_nav = $1, updated_at = NOW() WHERE scheme_code = $2`,
            [nav, scheme_code],
          );
          await this.db.query(
            `INSERT INTO mf_nav_history (scheme_code, date, nav) VALUES ($1, CURRENT_DATE, $2)
             ON CONFLICT (scheme_code, date) DO UPDATE SET nav = EXCLUDED.nav`,
            [scheme_code, nav],
          );
          updated++;
        }
      } catch (e) {
        this.log.warn(`Failed to fetch NAV for ${scheme_code}: ${(e as Error).message}`);
        errors++;
      }
    }

    this.log.log(`NAV poll complete: ${updated} updated, ${errors} errors`);
    return { updated, errors };
  }

  private async fetchLatestNav(schemeCode: string): Promise<string | null> {
    const url = `https://api.mfapi.in/mf/${schemeCode}/latest`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json() as { data?: Array<{ nav: string }> };
    return json.data?.[0]?.nav ?? null;
  }
}
```

- [ ] **Step 3: Write NAV poller test**

```typescript
// services/mf/src/nav/__tests__/nav-poller.spec.ts
import { NavPollerService } from '../nav-poller.service';

describe('NavPollerService', () => {
  it('fetchLatestNav returns null on non-200', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ scheme_code: '119551' }] }) } as any;
    const cfg = { get: jest.fn() } as any;
    const poller = new NavPollerService(db, cfg);
    const result = await poller.pollAll();
    expect(result.errors).toBe(0); // null nav = skip, not error
    expect(result.updated).toBe(0);
  });

  it('pollAll updates fund and nav_history on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ nav: '45.6700' }] }),
    }) as any;
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ scheme_code: '119551' }] }) } as any;
    const cfg = { get: jest.fn() } as any;
    const poller = new NavPollerService(db, cfg);
    const result = await poller.pollAll();
    expect(result.updated).toBe(1);
    expect(db.query).toHaveBeenCalledTimes(3); // SELECT + UPDATE fund + INSERT nav_history
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd services/mf && npx jest
```

Expected: All tests pass.

- [ ] **Step 5: Register SummaryController and NavPollerService in app.module**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(mf): add summary endpoint and NAV poller service"
```

---

## Phase 3: International Service (`intl`)

### Task 11: Database migration for intl service

**Files:**
- Create: `services/intl/src/scripts/migrate.ts`

- [ ] **Step 1: Write migration DDL**

Same pattern as Task 6 but with tables: `app_user`, `us_holding`, `us_transaction`, `espp_config`, `fx_rate`, `crypto_holding`, `crypto_transaction`, `idempotency_record`. Include RLS policies and indexes. (Full DDL from spec section 8.2)

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(intl): add database migration script"
```

---

### Task 12: US Holdings CRUD

**Files:**
- Create: `services/intl/src/us/us.repository.ts`
- Create: `services/intl/src/us/us.service.ts`
- Create: `services/intl/src/us/us.controller.ts`
- Create: `services/intl/src/us/us.dto.ts`
- Create: `services/intl/src/us/__tests__/us.service.spec.ts`

- [ ] **Step 1: Write US holding DTO**

```typescript
// services/intl/src/us/us.dto.ts
import { z } from 'zod';

export const CreateUsHoldingDto = z.object({
  ticker: z.string().min(1).max(10),
  name: z.string().optional(),
  sector: z.string().optional(),
  qty: z.string().regex(/^\d+(\.\d+)?$/),
  avgCostUsd: z.string().regex(/^\d+(\.\d+)?$/),
  lotKind: z.enum(['OPEN_MARKET', 'ESPP', 'RSU', 'BONUS']).default('OPEN_MARKET'),
  brokerName: z.string().optional(),
});

export const UpdateUsHoldingDto = z.object({
  qty: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  avgCostUsd: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  name: z.string().optional(),
});

export type CreateUsHoldingInput = z.infer<typeof CreateUsHoldingDto>;
export type UpdateUsHoldingInput = z.infer<typeof UpdateUsHoldingDto>;
```

- [ ] **Step 2: Write repository, service, controller** (same CRUD pattern as Fund in Task 7, adapted for US holdings with USD→INR conversion in the service view layer using latest fx_rate)

- [ ] **Step 3: Write test**

```typescript
// services/intl/src/us/__tests__/us.service.spec.ts
// Test: list returns holdings with INR conversion
// Test: get throws NotFoundException when not found
// Test: create calls repo and returns view with investedINR computed
```

- [ ] **Step 4: Run tests, register in module, commit**

```bash
git add -A
git commit -m "feat(intl): add US holdings CRUD with INR conversion"
```

---

### Task 13: Crypto Holdings CRUD

**Files:**
- Create: `services/intl/src/crypto/crypto.repository.ts`
- Create: `services/intl/src/crypto/crypto.service.ts`
- Create: `services/intl/src/crypto/crypto.controller.ts`
- Create: `services/intl/src/crypto/crypto.dto.ts`
- Create: `services/intl/src/crypto/__tests__/crypto.service.spec.ts`

- [ ] **Step 1: Write Crypto DTO**

```typescript
// services/intl/src/crypto/crypto.dto.ts
import { z } from 'zod';

export const CreateCryptoDto = z.object({
  coin: z.string().min(1).max(10),
  name: z.string().optional(),
  qty: z.string().regex(/^\d+(\.\d+)?$/),
  avgCostInr: z.string().regex(/^\d+(\.\d+)?$/),
  platform: z.string().optional(),
});

export const UpdateCryptoDto = z.object({
  qty: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  avgCostInr: z.string().regex(/^\d+(\.\d+)?$/).optional(),
});

export type CreateCryptoInput = z.infer<typeof CreateCryptoDto>;
export type UpdateCryptoInput = z.infer<typeof UpdateCryptoDto>;
```

- [ ] **Step 2: Write repository, service, controller** (CRUD pattern)

- [ ] **Step 3: Write test, run, register, commit**

```bash
git add -A
git commit -m "feat(intl): add crypto holdings CRUD"
```

---

### Task 14: FX rates endpoint + poller

**Files:**
- Create: `services/intl/src/fx/fx.controller.ts`
- Create: `services/intl/src/fx/fx-poller.service.ts`
- Create: `services/intl/src/fx/__tests__/fx-poller.spec.ts`

- [ ] **Step 1: Write FX controller**

```typescript
// services/intl/src/fx/fx.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { DbService, D, toWire } from '@tickernest/common';

@Controller('fx')
export class FxController {
  constructor(private readonly db: DbService) {}

  @Get('rates')
  async latestRates() {
    const { rows } = await this.db.query<{ pair: string; rate: string; date: string }>(
      `SELECT DISTINCT ON (pair) pair, rate, date FROM fx_rate ORDER BY pair, date DESC`,
    );
    return rows.reduce((acc, r) => ({ ...acc, [r.pair]: { rate: r.rate, date: r.date } }), {});
  }

  @Get('convert')
  async convert(@Query('from') from: string, @Query('to') to: string, @Query('amount') amount: string) {
    const pair = `${from}/${to}`;
    const { rows } = await this.db.query<{ rate: string }>(
      `SELECT rate FROM fx_rate WHERE pair = $1 ORDER BY date DESC LIMIT 1`, [pair],
    );
    if (!rows[0]) return { error: `No rate found for ${pair}` };
    const converted = D(amount).mul(D(rows[0].rate));
    return { from, to, amount, rate: rows[0].rate, converted: toWire(converted) };
  }
}
```

- [ ] **Step 2: Write FX poller (fetches from exchangerate.host daily)**

```typescript
// services/intl/src/fx/fx-poller.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '@tickernest/common';

@Injectable()
export class FxPollerService {
  private readonly log = new Logger(FxPollerService.name);
  private readonly pairs = ['USD/INR', 'EUR/INR', 'GBP/INR'];

  constructor(private readonly db: DbService) {}

  async pollAll(): Promise<{ updated: number }> {
    let updated = 0;
    for (const pair of this.pairs) {
      try {
        const [base, target] = pair.split('/');
        const url = `https://api.exchangerate.host/latest?base=${base}&symbols=${target}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json() as { rates?: Record<string, number> };
        const rate = json.rates?.[target!];
        if (rate) {
          await this.db.query(
            `INSERT INTO fx_rate (pair, date, rate, source) VALUES ($1, CURRENT_DATE, $2, 'exchangerate.host')
             ON CONFLICT (pair, date) DO UPDATE SET rate = EXCLUDED.rate`,
            [pair, String(rate)],
          );
          updated++;
        }
      } catch (e) {
        this.log.warn(`FX poll failed for ${pair}: ${(e as Error).message}`);
      }
    }
    return { updated };
  }
}
```

- [ ] **Step 3: Write test, register, commit**

```bash
git add -A
git commit -m "feat(intl): add FX rates endpoint and daily poller"
```

---

### Task 15: Intl Summary endpoint

**Files:**
- Create: `services/intl/src/summary/summary.controller.ts`

- [ ] **Step 1: Write summary that aggregates US + Crypto with FX conversion**

```typescript
// services/intl/src/summary/summary.controller.ts
import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { DbService, D, toWire, type ServiceSummary } from '@tickernest/common';

@Controller('summary')
export class SummaryController {
  constructor(private readonly db: DbService) {}

  @Get()
  async getSummary(@Req() req: Request): Promise<ServiceSummary> {
    const userId = req.user!.id;

    // Get latest USD/INR rate
    const { rows: fxRows } = await this.db.query<{ rate: string }>(
      `SELECT rate FROM fx_rate WHERE pair = 'USD/INR' ORDER BY date DESC LIMIT 1`,
    );
    const usdInr = fxRows[0] ? D(fxRows[0].rate) : D('83.5'); // fallback

    // US holdings
    const { rows: usRows } = await this.db.query<{ qty: string; avg_cost_usd: string }>(
      `SELECT qty, avg_cost_usd FROM us_holding WHERE user_id = $1 AND qty > 0`, [userId],
    );
    let usInvested = D(0);
    for (const r of usRows) usInvested = usInvested.add(D(r.qty).mul(D(r.avg_cost_usd)));
    const usInvestedInr = usInvested.mul(usdInr);

    // Crypto holdings
    const { rows: cryptoRows } = await this.db.query<{ qty: string; avg_cost_inr: string }>(
      `SELECT qty, avg_cost_inr FROM crypto_holding WHERE user_id = $1 AND qty > 0`, [userId],
    );
    let cryptoInvested = D(0);
    for (const r of cryptoRows) cryptoInvested = cryptoInvested.add(D(r.qty).mul(D(r.avg_cost_inr)));

    const totalInvested = usInvestedInr.add(cryptoInvested);

    return {
      totalInvested: toWire(totalInvested),
      currentValue: toWire(totalInvested), // current = invested until live quotes are wired
      totalPL: '0.0000',
      plPct: 0,
      asOf: new Date().toISOString(),
      breakdown: {
        us: { invested: toWire(usInvestedInr), current: toWire(usInvestedInr), pl: '0.0000' },
        crypto: { invested: toWire(cryptoInvested), current: toWire(cryptoInvested), pl: '0.0000' },
      },
    };
  }
}
```

- [ ] **Step 2: Register, commit**

```bash
git add -A
git commit -m "feat(intl): add summary endpoint aggregating US + crypto"
```

---

## Phase 4: Physical Assets Service (`physical`)

### Task 16: Database migration for physical service

**Files:**
- Create: `services/physical/src/scripts/migrate.ts`

- [ ] **Step 1: Write migration DDL** (tables: `app_user`, `gold_holding`, `sgb_holding`, `manual_asset`, `manual_asset_event`, `gold_rate_history`, `idempotency_record` — from spec section 8.3)

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(physical): add database migration script"
```

---

### Task 17: Gold + SGB CRUD

**Files:**
- Create: `services/physical/src/gold/gold.repository.ts`
- Create: `services/physical/src/gold/gold.service.ts`
- Create: `services/physical/src/gold/gold.controller.ts`
- Create: `services/physical/src/gold/gold.dto.ts`
- Create: `services/physical/src/gold/__tests__/gold.service.spec.ts`

- [ ] **Step 1: Write Gold DTO**

```typescript
// services/physical/src/gold/gold.dto.ts
import { z } from 'zod';

export const CreateGoldDto = z.object({
  type: z.enum(['PHYSICAL', 'DIGITAL']),
  weightGrams: z.string().regex(/^\d+(\.\d+)?$/),
  purity: z.number().int().refine(v => [999, 995, 958, 916, 750, 585].includes(v)),
  purchasePricePerGram: z.string().regex(/^\d+(\.\d+)?$/),
  purchaseDate: z.string().optional(),
  storageLocation: z.string().optional(),
  notes: z.string().optional(),
});

export const CreateSgbDto = z.object({
  seriesName: z.string().min(1),
  units: z.string().regex(/^\d+(\.\d+)?$/),
  purchaseNav: z.string().regex(/^\d+(\.\d+)?$/),
  purchaseDate: z.string(),
  maturityDate: z.string(),
  couponRate: z.string().regex(/^\d+(\.\d+)?$/).default('2.5'),
  broker: z.string().optional(),
});

export type CreateGoldInput = z.infer<typeof CreateGoldDto>;
export type CreateSgbInput = z.infer<typeof CreateSgbDto>;
```

- [ ] **Step 2: Write repository, service, controller for Gold + SGB (combined controller with /gold and /sgb routes)**

- [ ] **Step 3: Write test computing gold value = weight × purity_factor × current_rate**

- [ ] **Step 4: Run tests, register, commit**

```bash
git add -A
git commit -m "feat(physical): add gold and SGB CRUD with valuation"
```

---

### Task 18: Manual Assets CRUD (PPF, EPF, FD, etc.)

**Files:**
- Create: `services/physical/src/assets/assets.repository.ts`
- Create: `services/physical/src/assets/assets.service.ts`
- Create: `services/physical/src/assets/assets.controller.ts`
- Create: `services/physical/src/assets/assets.dto.ts`
- Create: `services/physical/src/assets/__tests__/assets.service.spec.ts`

- [ ] **Step 1: Write Manual Asset DTO**

```typescript
// services/physical/src/assets/assets.dto.ts
import { z } from 'zod';

export const CreateAssetDto = z.object({
  type: z.enum(['PPF', 'EPF', 'NPS', 'FD', 'RD', 'INSURANCE', 'REAL_ESTATE', 'OTHER']),
  name: z.string().min(1),
  institution: z.string().optional(),
  invested: z.string().regex(/^\d+(\.\d+)?$/).default('0'),
  currentValue: z.string().regex(/^\d+(\.\d+)?$/).default('0'),
  interestRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  maturityDate: z.string().optional(),
  nominee: z.string().optional(),
  notes: z.string().optional(),
});

export const CreateEventDto = z.object({
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'INTEREST', 'MATURITY', 'PREMIUM']),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  eventDate: z.string(),
  notes: z.string().optional(),
});

export type CreateAssetInput = z.infer<typeof CreateAssetDto>;
export type CreateEventInput = z.infer<typeof CreateEventDto>;
```

- [ ] **Step 2: Write repository with event tracking (deposits update currentValue)**

- [ ] **Step 3: Write service, controller with /assets and /assets/:id/events routes**

- [ ] **Step 4: Write test: deposit event increases currentValue**

- [ ] **Step 5: Run tests, register, commit**

```bash
git add -A
git commit -m "feat(physical): add manual assets CRUD with event tracking"
```

---

### Task 19: Physical Summary endpoint

**Files:**
- Create: `services/physical/src/summary/summary.controller.ts`

- [ ] **Step 1: Write summary aggregating gold + SGB + manual assets**

Same pattern as mf/intl summaries. Gold value = weight × current_rate_24k × (purity/999). SGB value = units × current_nav. Manual = sum of currentValue.

- [ ] **Step 2: Register, commit**

```bash
git add -A
git commit -m "feat(physical): add summary endpoint"
```

---

## Phase 5: Gateway + Frontend

### Task 20: Add gateway /net-worth route to existing API

**Files:**
- Create: `services/api/src/gateway/gateway.controller.ts`
- Create: `services/api/src/gateway/gateway.service.ts`
- Create: `services/api/src/gateway/__tests__/gateway.service.spec.ts`
- Modify: `services/api/src/app.module.ts`

- [ ] **Step 1: Write gateway service**

```typescript
// services/api/src/gateway/gateway.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { D, toWire, type ServiceSummary } from '@tickernest/common';
import { PortfolioService } from '../portfolio/portfolio.service';

@Injectable()
export class GatewayService {
  private readonly log = new Logger(GatewayService.name);
  private readonly mfUrl: string;
  private readonly intlUrl: string;
  private readonly physicalUrl: string;

  constructor(cfg: ConfigService, private readonly portfolio: PortfolioService) {
    this.mfUrl = cfg.get('MF_SERVICE_URL') || 'http://tickernest-mf.internal:3001';
    this.intlUrl = cfg.get('INTL_SERVICE_URL') || 'http://tickernest-intl.internal:3002';
    this.physicalUrl = cfg.get('PHYSICAL_SERVICE_URL') || 'http://tickernest-physical.internal:3003';
  }

  async getNetWorth(userId: string, token: string) {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const [stocks, mf, intl, physical] = await Promise.allSettled([
      this.portfolio.getSummary(userId),
      this.fetchSummary(this.mfUrl, headers),
      this.fetchSummary(this.intlUrl, headers),
      this.fetchSummary(this.physicalUrl, headers),
    ]);

    const extract = (r: PromiseSettledResult<ServiceSummary>): ServiceSummary | null =>
      r.status === 'fulfilled' ? r.value : null;

    const parts = [extract(stocks), extract(mf), extract(intl), extract(physical)];
    const available = parts.filter(Boolean) as ServiceSummary[];

    const totalInvested = available.reduce((s, p) => s.add(D(p.totalInvested)), D(0));
    const totalCurrent = available.reduce((s, p) => s.add(D(p.currentValue)), D(0));
    const totalPL = totalCurrent.sub(totalInvested);
    const plPct = totalInvested.isZero() ? 0 : totalPL.div(totalInvested).mul(100).toNumber();

    return {
      stocks: extract(stocks),
      mutualFunds: extract(mf),
      international: extract(intl),
      physicalAssets: extract(physical),
      total: {
        invested: toWire(totalInvested),
        current: toWire(totalCurrent),
        pl: toWire(totalPL),
        plPct: Math.round(plPct * 100) / 100,
      },
      degraded: parts.some(p => p === null),
    };
  }

  private async fetchSummary(baseUrl: string, headers: Record<string, string>): Promise<ServiceSummary> {
    const res = await fetch(`${baseUrl}/summary`, { headers });
    if (!res.ok) throw new Error(`${baseUrl} returned ${res.status}`);
    return res.json() as Promise<ServiceSummary>;
  }
}
```

- [ ] **Step 2: Write gateway controller**

```typescript
// services/api/src/gateway/gateway.controller.ts
import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { GatewayService } from './gateway.service';

@Controller('net-worth')
export class GatewayController {
  constructor(private readonly svc: GatewayService) {}

  @Get()
  getNetWorth(@Req() req: Request) {
    const token = req.header('authorization')!.slice('Bearer '.length);
    return this.svc.getNetWorth(req.user!.id, token);
  }
}
```

- [ ] **Step 3: Write test (mock fetch, verify aggregation math)**

```typescript
// services/api/src/gateway/__tests__/gateway.service.spec.ts
import { GatewayService } from '../gateway.service';

describe('GatewayService', () => {
  it('aggregates partial results when one service is down', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ totalInvested: '100000', currentValue: '110000', totalPL: '10000', plPct: 10, asOf: '', breakdown: {} }) })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ totalInvested: '50000', currentValue: '55000', totalPL: '5000', plPct: 10, asOf: '', breakdown: {} }) }) as any;

    const portfolio = { getSummary: jest.fn().mockResolvedValue({ totalInvested: '200000', currentValue: '220000', totalPL: '20000', plPct: 10, asOf: '', breakdown: {} }) } as any;
    const cfg = { get: (k: string) => k === 'MF_SERVICE_URL' ? 'http://mf' : k === 'INTL_SERVICE_URL' ? 'http://intl' : 'http://phys' } as any;

    const svc = new GatewayService(cfg, portfolio);
    const result = await svc.getNetWorth('u1', 'tok');

    expect(result.degraded).toBe(true);
    expect(result.total.invested).toBe('350000.0000'); // stocks + mf + physical (intl failed)
  });
});
```

- [ ] **Step 4: Register GatewayController + GatewayService in app.module, add env vars to .env.example**

- [ ] **Step 5: Run tests**

```bash
cd services/api && npx jest
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): add /net-worth gateway aggregating all services"
```

---

### Task 21: Frontend product switcher (top nav)

**Files:**
- Modify: `web/src/components/AppShell.tsx`
- Create: `web/src/components/ProductNav.tsx`
- Create: `web/src/lib/services.ts`
- Modify: `web/src/main.tsx` (add lazy routes for mf/investments/assets)
- Create: `web/src/pages/mf/MfPortfolio.tsx` (placeholder)
- Create: `web/src/pages/investments/UsHoldings.tsx` (placeholder)
- Create: `web/src/pages/assets/AssetsList.tsx` (placeholder)

- [ ] **Step 1: Create service URL config**

```typescript
// web/src/lib/services.ts
export const SERVICES = {
  stocks: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  mf: import.meta.env.VITE_MF_URL || 'http://localhost:3001',
  intl: import.meta.env.VITE_INTL_URL || 'http://localhost:3002',
  physical: import.meta.env.VITE_PHYSICAL_URL || 'http://localhost:3003',
} as const;

export type ServiceKey = keyof typeof SERVICES;
```

- [ ] **Step 2: Create ProductNav component**

```tsx
// web/src/components/ProductNav.tsx
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

const PRODUCTS = [
  { label: 'Stocks', to: '/stocks', color: 'text-green-500' },
  { label: 'Mutual Funds', to: '/mf', color: 'text-blue-500' },
  { label: 'Investments', to: '/investments', color: 'text-purple-500' },
  { label: 'Assets', to: '/assets', color: 'text-amber-500' },
] as const;

export function ProductNav() {
  return (
    <nav className="flex items-center gap-6 border-b px-6 py-2 bg-background">
      {PRODUCTS.map((p) => (
        <NavLink
          key={p.to}
          to={p.to}
          className={({ isActive }) =>
            cn('text-sm font-medium transition-colors hover:text-foreground',
              isActive ? `${p.color} border-b-2 border-current pb-1` : 'text-muted-foreground')
          }
        >
          {p.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Create placeholder pages**

```tsx
// web/src/pages/mf/MfPortfolio.tsx
export default function MfPortfolio() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Mutual Funds</h1><p className="text-muted-foreground mt-2">Coming soon — portfolio, SIP tracker, ULIP management.</p></div>;
}
```

```tsx
// web/src/pages/investments/UsHoldings.tsx
export default function UsHoldings() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Investments</h1><p className="text-muted-foreground mt-2">Coming soon — US stocks, crypto, FX.</p></div>;
}
```

```tsx
// web/src/pages/assets/AssetsList.tsx
export default function AssetsList() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Assets</h1><p className="text-muted-foreground mt-2">Coming soon — Gold, PPF, EPF, FD, real estate.</p></div>;
}
```

- [ ] **Step 4: Update main.tsx to add product routes with lazy loading**

Add to routes inside `<Route path="/" ...>`:
```tsx
{/* Product routes */}
<Route path="stocks/*" element={<Navigate to="/dashboard" replace />} />
<Route path="mf/*" element={<MfPortfolio />} />
<Route path="investments/*" element={<UsHoldings />} />
<Route path="assets/*" element={<AssetsList />} />
```

- [ ] **Step 5: Add ProductNav to AppShell**

Insert `<ProductNav />` at the top of AppShell, above the existing sub-nav.

- [ ] **Step 6: Verify web builds**

```bash
cd web && npx tsc --noEmit && npx vite build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): add product switcher nav (Stocks, MF, Investments, Assets)"
```

---

### Task 22: Full turbo build + final verification

**Files:**
- Modify: Root `package.json` if needed

- [ ] **Step 1: Install all workspace dependencies**

```bash
cd /Users/satish.verma/.agents/artifacts/TickerNest && npm install
```

- [ ] **Step 2: Run full turbo build**

```bash
npx turbo run build
```

Expected: All packages and services build without errors.

- [ ] **Step 3: Run all tests**

```bash
npx turbo run test
```

Expected: All test suites pass across all services.

- [ ] **Step 4: Run typecheck across everything**

```bash
npx turbo run typecheck
```

Expected: No type errors.

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "chore: verify full monorepo build, all tests passing"
```

---

## Summary

| Phase | Tasks | What it delivers |
|---|---|---|
| 1 — Foundation | Tasks 1-5 | Monorepo structure, @tickernest/common, 3 service scaffolds |
| 2 — MF Service | Tasks 6-10 | Mutual funds, SIP, ULIP, NAV poller, summary |
| 3 — Intl Service | Tasks 11-15 | US holdings, crypto, FX rates, pollers, summary |
| 4 — Physical | Tasks 16-19 | Gold, SGB, manual assets, events, summary |
| 5 — Gateway + UI | Tasks 20-22 | /net-worth aggregation, product switcher nav |

**Total: 22 tasks, ~134 test cases expected across all services.**
