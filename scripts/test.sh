#!/bin/bash
# Roda testes de integração conectando ao Postgres e Redis via rede Docker
set -e

cd /opt/bibelocrm/api

# Busca IPs dos containers
PG_IP=$(docker inspect bibelo_postgres --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
REDIS_IP=$(docker inspect bibelo_redis --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')

# Extrai credenciais do DATABASE_URL no .env
DB_URL=$(grep '^DATABASE_URL=' /opt/bibelocrm/.env | cut -d= -f2-)
DB_PASS=$(echo "$DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')

# Carrega demais variáveis do .env (JWT_SECRET etc)
set -a
grep -v '^#' /opt/bibelocrm/.env | grep -v '^$' | grep -v 'DATABASE_URL\|REDIS_URL\|DB_HOST' > /tmp/bibelo_test_env 2>/dev/null
source /tmp/bibelo_test_env 2>/dev/null || true
rm -f /tmp/bibelo_test_env
set +a

export DATABASE_URL="postgresql://bibelocrm:${DB_PASS}@${PG_IP}:5432/bibelocrm"
REDIS_PASS=$(grep '^REDIS_PASS=' /opt/bibelocrm/.env | cut -d= -f2-)
export REDIS_URL="redis://:${REDIS_PASS}@${REDIS_IP}:6379"
export NODE_ENV=test

echo "Rodando testes... (Postgres: ${PG_IP}, Redis: ${REDIS_IP})"
npx vitest run "$@"
