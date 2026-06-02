# TickerNest API — Fly.io image.
# Multi-stage: builder installs+compiles, runtime ships only dist + prod deps.

# ----- builder -----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npx nest build

# Strip dev deps for the runtime image.
RUN npm prune --omit=dev

# ----- runtime -----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# pg requires libc; node:alpine ships musl, so we install postgresql-client
# only when we explicitly want psql (not at runtime).

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

EXPOSE 8080
USER node
CMD ["node", "dist/main.js"]
