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

# ── Upload para Google Drive ──────────────────────────────────────
GDRIVE_REMOTE="gdrive-backup"
GDRIVE_RETENTION_DAYS=30
if command -v rclone &>/dev/null && rclone listremotes 2>/dev/null | grep -q "${GDRIVE_REMOTE}:"; then
  rclone copy "${BACKUP_FILE}" "${GDRIVE_REMOTE}:" --quiet 2>/dev/null \
    && echo "${LOG} [OK] Upload Google Drive concluído (${SIZE})" \
    || echo "${LOG} [ERR] Falha no upload Google Drive"
  # Remove backups antigos do Drive (mantém últimos 30 dias)
  rclone delete "${GDRIVE_REMOTE}:" --min-age "${GDRIVE_RETENTION_DAYS}d" --quiet 2>/dev/null \
    && echo "${LOG} [OK] Limpeza Google Drive (>${GDRIVE_RETENTION_DAYS} dias)" \
    || true
else
  echo "${LOG} [SKIP] rclone não configurado — backup apenas local"
fi

DISK=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
[ "$DISK" -gt 85 ] && echo "${LOG} [!!] DISCO com ${DISK}% de uso!"
echo "${LOG} [BibelôCRM] Backup concluído."
