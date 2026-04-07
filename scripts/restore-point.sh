#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# BibelôCRM — Ponto de Restauração
# Cria snapshot completo: banco (pg_dump) + tag git + metadados
# Uso:
#   bash scripts/restore-point.sh create "antes do deploy X"
#   bash scripts/restore-point.sh list
#   bash scripts/restore-point.sh restore 20260407_120000
#   bash scripts/restore-point.sh info 20260407_120000
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="/opt/bibelocrm"
BACKUP_DIR="${APP_DIR}/backups/restore-points"
RETENTION_DAYS=30
source "${APP_DIR}/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC}  $1"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ✗${NC}  $1" >&2; }

# ── CREATE ──────────────────────────────────────────────────────

create_restore_point() {
  local DESCRICAO="${1:-Ponto de restauração manual}"
  local DATE=$(date '+%Y%m%d_%H%M%S')
  local POINT_DIR="${BACKUP_DIR}/${DATE}"

  mkdir -p "${POINT_DIR}"
  log "Criando ponto de restauração: ${CYAN}${DATE}${NC}"
  log "Descrição: ${DESCRICAO}"

  # 1. Dump do banco completo (todos os schemas)
  log "Exportando banco de dados..."
  docker compose -f "${APP_DIR}/docker-compose.yml" exec -T postgres \
    pg_dump -U "${DB_USER}" --format=custom --compress=6 "${DB_NAME}" \
    > "${POINT_DIR}/database.dump" \
    || { err "pg_dump falhou"; rm -rf "${POINT_DIR}"; exit 1; }

  local DB_SIZE=$(du -sh "${POINT_DIR}/database.dump" | cut -f1)
  log "Banco exportado: ${DB_SIZE}"

  # 2. Dump separado apenas das tabelas críticas (restauração parcial)
  log "Exportando tabelas críticas separadamente..."
  for schema_table in "crm.customers" "crm.customer_scores" "crm.interactions" \
    "marketing.flows" "marketing.flow_executions" "marketing.templates" \
    "marketing.campaigns" "marketing.leads" "marketing.popup_config" \
    "sync.bling_orders" "sync.nuvemshop_orders" "sync.sync_state" \
    "financeiro.lancamentos" "financeiro.despesas_fixas" \
    "public.users"; do
    docker compose -f "${APP_DIR}/docker-compose.yml" exec -T postgres \
      pg_dump -U "${DB_USER}" --format=custom --table="${schema_table}" "${DB_NAME}" \
      > "${POINT_DIR}/table_$(echo ${schema_table} | tr '.' '_').dump" 2>/dev/null || true
  done

  # 3. Git state
  local GIT_HASH=$(git -C "${APP_DIR}" rev-parse HEAD)
  local GIT_BRANCH=$(git -C "${APP_DIR}" branch --show-current)
  local GIT_STATUS=$(git -C "${APP_DIR}" status --porcelain | wc -l)
  local GIT_TAG="restore-${DATE}"

  git -C "${APP_DIR}" tag -a "${GIT_TAG}" -m "Ponto de restauração: ${DESCRICAO}" 2>/dev/null || true

  # 4. Docker images state
  local API_IMAGE=$(docker inspect bibelo_api --format='{{.Image}}' 2>/dev/null | cut -c8-19)
  local FRONTEND_IMAGE=$(docker inspect bibelo_frontend --format='{{.Image}}' 2>/dev/null | cut -c8-19)

  # 5. Containers health
  local CONTAINERS=$(docker compose -f "${APP_DIR}/docker-compose.yml" ps --format json 2>/dev/null | head -10)

  # 6. .env snapshot (sem valores sensíveis — só chaves)
  grep -oP '^[A-Z_]+=' "${APP_DIR}/.env" | sort > "${POINT_DIR}/env_keys.txt"

  # 7. Metadados
  cat > "${POINT_DIR}/metadata.json" <<METADATA
{
  "id": "${DATE}",
  "descricao": "${DESCRICAO}",
  "criado_em": "$(date -Iseconds)",
  "git_hash": "${GIT_HASH}",
  "git_branch": "${GIT_BRANCH}",
  "git_tag": "${GIT_TAG}",
  "git_uncommitted_files": ${GIT_STATUS},
  "api_image": "${API_IMAGE}",
  "frontend_image": "${FRONTEND_IMAGE}",
  "db_size": "${DB_SIZE}",
  "disk_usage": "$(df -h / | awk 'NR==2{print $5}')"
}
METADATA

  # 8. Limpeza de pontos antigos
  local DELETED=0
  if [ -d "${BACKUP_DIR}" ]; then
    for old_dir in $(find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -mtime +${RETENTION_DAYS}); do
      local old_tag=$(cat "${old_dir}/metadata.json" 2>/dev/null | grep -oP '"git_tag":\s*"\K[^"]+' || echo "")
      [ -n "$old_tag" ] && git -C "${APP_DIR}" tag -d "${old_tag}" 2>/dev/null || true
      rm -rf "${old_dir}"
      DELETED=$((DELETED + 1))
    done
  fi

  local TOTAL_SIZE=$(du -sh "${POINT_DIR}" | cut -f1)
  echo ""
  log "═══════════════════════════════════════════════"
  log "Ponto de restauração criado com sucesso!"
  log "═══════════════════════════════════════════════"
  log "  ID:        ${CYAN}${DATE}${NC}"
  log "  Git:       ${GIT_HASH:0:7} (${GIT_BRANCH})"
  log "  Tag:       ${GIT_TAG}"
  log "  Banco:     ${DB_SIZE}"
  log "  Total:     ${TOTAL_SIZE}"
  log "  Caminho:   ${POINT_DIR}"
  [ $DELETED -gt 0 ] && warn "${DELETED} ponto(s) antigo(s) removido(s) (>${RETENTION_DAYS} dias)"
  echo ""
  log "Para restaurar: ${CYAN}bash scripts/restore-point.sh restore ${DATE}${NC}"
}

# ── LIST ────────────────────────────────────────────────────────

list_restore_points() {
  if [ ! -d "${BACKUP_DIR}" ] || [ -z "$(ls -A "${BACKUP_DIR}" 2>/dev/null)" ]; then
    warn "Nenhum ponto de restauração encontrado."
    log "Crie um com: ${CYAN}bash scripts/restore-point.sh create \"descrição\"${NC}"
    return
  fi

  echo ""
  echo -e "${CYAN}═══ Pontos de Restauração — BibelôCRM ═══${NC}"
  echo ""
  printf "%-18s %-8s %-10s %-40s\n" "ID" "BANCO" "GIT" "DESCRIÇÃO"
  printf "%-18s %-8s %-10s %-40s\n" "──────────────────" "────────" "──────────" "────────────────────────────────────────"

  for dir in $(ls -1d "${BACKUP_DIR}"/*/ 2>/dev/null | sort -r); do
    local meta="${dir}metadata.json"
    if [ -f "$meta" ]; then
      local id=$(grep -oP '"id":\s*"\K[^"]+' "$meta")
      local desc=$(grep -oP '"descricao":\s*"\K[^"]+' "$meta")
      local db_size=$(grep -oP '"db_size":\s*"\K[^"]+' "$meta")
      local git_hash=$(grep -oP '"git_hash":\s*"\K[^"]+' "$meta")
      printf "%-18s %-8s %-10s %-40s\n" "$id" "$db_size" "${git_hash:0:7}" "${desc:0:40}"
    fi
  done
  echo ""
}

# ── INFO ────────────────────────────────────────────────────────

info_restore_point() {
  local POINT_ID="$1"
  local POINT_DIR="${BACKUP_DIR}/${POINT_ID}"
  local META="${POINT_DIR}/metadata.json"

  if [ ! -f "$META" ]; then
    err "Ponto de restauração '${POINT_ID}' não encontrado."
    return 1
  fi

  echo ""
  echo -e "${CYAN}═══ Detalhes do Ponto de Restauração ═══${NC}"
  echo ""
  cat "$META" | python3 -m json.tool 2>/dev/null || cat "$META"
  echo ""

  log "Tabelas disponíveis para restauração parcial:"
  ls -1 "${POINT_DIR}"/table_*.dump 2>/dev/null | while read f; do
    local name=$(basename "$f" .dump | sed 's/table_//' | tr '_' '.')
    local size=$(du -sh "$f" | cut -f1)
    echo "  - ${name} (${size})"
  done
  echo ""
}

# ── RESTORE ─────────────────────────────────────────────────────

restore_from_point() {
  local POINT_ID="$1"
  local POINT_DIR="${BACKUP_DIR}/${POINT_ID}"
  local META="${POINT_DIR}/metadata.json"
  local DB_DUMP="${POINT_DIR}/database.dump"

  if [ ! -f "$META" ]; then
    err "Ponto de restauração '${POINT_ID}' não encontrado."
    return 1
  fi

  local DESC=$(grep -oP '"descricao":\s*"\K[^"]+' "$META")
  local GIT_HASH=$(grep -oP '"git_hash":\s*"\K[^"]+' "$META")
  local CRIADO_EM=$(grep -oP '"criado_em":\s*"\K[^"]+' "$META")

  echo ""
  echo -e "${RED}═══════════════════════════════════════════════${NC}"
  echo -e "${RED}    ATENÇÃO: RESTAURAÇÃO DO SISTEMA${NC}"
  echo -e "${RED}═══════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Ponto:     ${CYAN}${POINT_ID}${NC}"
  echo -e "  Descrição: ${DESC}"
  echo -e "  Criado em: ${CRIADO_EM}"
  echo -e "  Git:       ${GIT_HASH:0:7}"
  echo ""
  echo -e "${YELLOW}  Isso irá:${NC}"
  echo "  1. Criar um novo ponto de restauração do estado ATUAL (segurança)"
  echo "  2. Parar a API e frontend"
  echo "  3. Restaurar o banco de dados completo"
  echo "  4. Fazer git checkout do código correspondente"
  echo "  5. Rebuild e restart dos containers"
  echo ""
  echo -ne "${RED}  Tem certeza? Digite 'RESTAURAR' para confirmar: ${NC}"
  read -r CONFIRM

  if [ "$CONFIRM" != "RESTAURAR" ]; then
    warn "Restauração cancelada."
    return 0
  fi

  # 1. Criar ponto de segurança do estado atual
  log "Criando ponto de segurança do estado atual..."
  create_restore_point "Auto-backup antes de restaurar para ${POINT_ID}"

  # 2. Parar API e frontend
  log "Parando containers..."
  docker compose -f "${APP_DIR}/docker-compose.yml" stop api frontend

  # 3. Restaurar banco
  log "Restaurando banco de dados..."
  docker compose -f "${APP_DIR}/docker-compose.yml" exec -T postgres \
    pg_restore -U "${DB_USER}" --clean --if-exists --no-owner -d "${DB_NAME}" \
    < "${DB_DUMP}" 2>/dev/null || warn "Alguns warnings no pg_restore (normal)"

  # 4. Git checkout
  log "Restaurando código para ${GIT_HASH:0:7}..."
  git -C "${APP_DIR}" stash 2>/dev/null || true
  git -C "${APP_DIR}" checkout "${GIT_HASH}"

  # 5. Rebuild
  log "Reconstruindo containers..."
  docker compose -f "${APP_DIR}/docker-compose.yml" up -d --build api frontend

  # 6. Health check
  log "Aguardando API..."
  for i in $(seq 1 12); do
    sleep 5
    local STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health 2>/dev/null)
    if [ "$STATUS" = "200" ]; then
      echo ""
      log "═══════════════════════════════════════════════"
      log "Sistema restaurado com sucesso!"
      log "═══════════════════════════════════════════════"
      log "  Banco:  restaurado de ${POINT_ID}"
      log "  Código: ${GIT_HASH:0:7}"
      log "  API:    healthy"
      return 0
    fi
    echo -n "."
  done

  err "API não respondeu após 60s — verificar logs: docker compose logs -f api"
  return 1
}

# ── MAIN ────────────────────────────────────────────────────────

case "${1:-}" in
  create)
    create_restore_point "${2:-Ponto de restauração manual}"
    ;;
  list)
    list_restore_points
    ;;
  info)
    [ -z "${2:-}" ] && { err "Uso: $0 info <ID>"; exit 1; }
    info_restore_point "$2"
    ;;
  restore)
    [ -z "${2:-}" ] && { err "Uso: $0 restore <ID>"; exit 1; }
    restore_from_point "$2"
    ;;
  *)
    echo ""
    echo -e "${CYAN}BibelôCRM — Ponto de Restauração${NC}"
    echo ""
    echo "Uso:"
    echo "  $0 create \"descrição\"    Cria ponto de restauração"
    echo "  $0 list                  Lista todos os pontos"
    echo "  $0 info <ID>             Detalhes de um ponto"
    echo "  $0 restore <ID>          Restaura o sistema"
    echo ""
    echo "Exemplos:"
    echo "  $0 create \"antes do deploy de fluxos novos\""
    echo "  $0 create \"backup pré-migração banco\""
    echo "  $0 restore 20260407_120000"
    echo ""
    ;;
esac
