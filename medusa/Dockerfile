FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx medusa build

FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/.medusa ./.medusa
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/medusa-config.ts ./

EXPOSE 9000

CMD ["node", ".medusa/server/index.js"]
