# ── Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline
COPY . .
RUN npm run build

# ── Production stage
FROM node:20-alpine AS production
RUN addgroup -S bibelo && adduser -S bibelo -G bibelo
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY server.js ./server.js
RUN chown -R bibelo:bibelo /app
USER bibelo
EXPOSE 3000
CMD ["node", "server.js"]
