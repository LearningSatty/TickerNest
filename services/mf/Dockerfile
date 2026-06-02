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
