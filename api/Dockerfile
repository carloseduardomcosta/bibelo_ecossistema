# ── Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production stage (slim = Debian com glibc — necessário para onnxruntime)
FROM node:20-slim AS production
RUN groupadd -r bibelo && useradd -r -g bibelo bibelo
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN mkdir -p logs uploads/nf && chown -R bibelo:bibelo /app
USER bibelo
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://0.0.0.0:4000/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
CMD ["node", "dist/server.js"]
