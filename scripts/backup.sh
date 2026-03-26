#!/usr/bin/env bash
set -euo pipefail
APP_DIR="/opt/bibelocrm"
BACKUP_DIR="${APP_DIR}/backups"
DATE=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="${BACKUP_DIR}/bibelocrm_${DATE}.sql.gz"
RETENTION_DAYS=7
LOG="[$(date '+%Y-%m-%d %H:%M:%S')]"
source "${APP_DIR}/.env"
mkdir -p "${BACKUP_DIR}"
echo "${LOG} [BibelôCRM] Iniciando backup..."
docker compose -f "${APP_DIR}/docker-compose.yml" exec -T postgres \
  pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${BACKUP_FILE}" \
  || (echo "${LOG} [ERR] pg_dump falhou" && exit 1)
SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "${LOG} [OK] ${BACKUP_FILE} (${SIZE})"
DELETED=$(find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete -print | wc -l)
[ $DELETED -gt 0 ] && echo "${LOG} [OK] ${DELETED} backup(s) antigos removidos"
DISK=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
[ "$DISK" -gt 85 ] && echo "${LOG} [!!] DISCO com ${DISK}% de uso!"
echo "${LOG} [BibelôCRM] Backup concluído."
