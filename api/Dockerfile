# ── Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production stage
FROM node:20-alpine AS production
RUN addgroup -S bibelo && adduser -S bibelo -G bibelo
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN mkdir -p logs && chown -R bibelo:bibelo /app
USER bibelo
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/server.js"]
