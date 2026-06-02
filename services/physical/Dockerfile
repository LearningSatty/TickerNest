FROM node:20-slim AS builder
WORKDIR /app
COPY package.json turbo.json ./
COPY packages/common/package.json packages/common/
COPY services/physical/package.json services/physical/
RUN npm install --workspace=packages/common --workspace=services/physical
COPY packages/common packages/common
COPY services/physical services/physical
RUN npx turbo run build --filter=tickernest-physical

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/physical/dist ./dist
COPY --from=builder /app/services/physical/package.json ./
COPY --from=builder /app/packages/common/dist ./node_modules/@tickernest/common/dist
COPY --from=builder /app/packages/common/package.json ./node_modules/@tickernest/common/
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3003
CMD ["node", "dist/main.js"]
