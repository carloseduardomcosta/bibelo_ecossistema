#!/bin/bash
# Roda testes de integração conectando ao Postgres e Redis via rede Docker
set -e

cd /opt/bibelocrm/api

# Busca IPs dos containers
PG_IP=$(docker inspect bibelo_postgres --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
REDIS_IP=$(docker inspect bibelo_redis --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')

# Carrega variáveis do .env (JWT_SECRET etc)
source /opt/bibelocrm/.env 2>/dev/null || true

export DATABASE_URL="postgresql://bibelocrm:${POSTGRES_PASSWORD:-$( grep POSTGRES_PASSWORD /opt/bibelocrm/.env | cut -d= -f2-)}@${PG_IP}:5432/bibelocrm"
export REDIS_URL="redis://:${REDIS_PASSWORD:-}@${REDIS_IP}:6379"
export NODE_ENV=test

echo "Rodando testes... (Postgres: ${PG_IP}, Redis: ${REDIS_IP})"
npx vitest run "$@"
