FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN DATABASE_URL=postgres://x:x@localhost/x \
    REDIS_URL=redis://localhost:6379 \
    STORE_CORS=http://localhost \
    ADMIN_CORS=http://localhost \
    AUTH_CORS=http://localhost \
    ./node_modules/.bin/medusa build

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -S medusa && adduser -S medusa -G medusa
COPY --from=builder --chown=medusa:medusa /app/.medusa ./.medusa
COPY --from=builder --chown=medusa:medusa /app/node_modules ./node_modules
COPY --from=builder --chown=medusa:medusa /app/package.json ./
COPY --from=builder --chown=medusa:medusa /app/medusa-config.ts ./
COPY --from=builder --chown=medusa:medusa /app/tsconfig.json ./
COPY --from=builder --chown=medusa:medusa /app/dist/src ./src
COPY --from=builder --chown=medusa:medusa /app/dist/public/admin ./public/admin
USER medusa
ENV NODE_ENV=production
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=90s \
  CMD node -e "require('http').get('http://localhost:9000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
