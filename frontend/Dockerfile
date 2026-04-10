# ── Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline
COPY . .
RUN npm run build

# ── Production stage
FROM node:20-alpine AS production
RUN apk add --no-cache tzdata
RUN addgroup -S bibelo && adduser -S bibelo -G bibelo
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY server.js ./server.js
RUN chown -R bibelo:bibelo /app
USER bibelo
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD node -e "require('http').get('http://localhost:3000/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "server.js"]
