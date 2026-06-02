FROM node:20-slim AS builder
WORKDIR /app
COPY package.json turbo.json ./
COPY packages/common/package.json packages/common/
COPY services/intl/package.json services/intl/
RUN npm install --workspace=packages/common --workspace=services/intl
COPY packages/common packages/common
COPY services/intl services/intl
RUN npx turbo run build --filter=tickernest-intl

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/intl/dist ./dist
COPY --from=builder /app/services/intl/package.json ./
COPY --from=builder /app/packages/common/dist ./node_modules/@tickernest/common/dist
COPY --from=builder /app/packages/common/package.json ./node_modules/@tickernest/common/
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3002
CMD ["node", "dist/main.js"]
