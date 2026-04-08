#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# DR Backup — Disaster Recovery completo do BibelôCRM
# Envia snapshot semanal para Google Drive
# Cron sugerido: 0 4 * * 0  (domingos às 4h)
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="/opt/bibelocrm"
DATE=$(date '+%Y%m%d_%H%M%S')
DR_DIR="/tmp/dr_${DATE}"
DR_FILE="${APP_DIR}/backups/dr_${DATE}.tar.gz"
GDRIVE_REMOTE="gdrive-backup"
GDRIVE_DR_FOLDER="dr-semanal"
DR_RETENTION_DAYS=60
LOG="[$(date '+%Y-%m-%d %H:%M:%S')] [DR]"

source "${APP_DIR}/.env"

echo "${LOG} Iniciando backup de Disaster Recovery..."
mkdir -p "${DR_DIR}"

# ── 1. Secrets e configuração ─────────────────────────────────────
echo "${LOG} Copiando secrets e configs..."
mkdir -p "${DR_DIR}/secrets"
cp "${APP_DIR}/.env" "${DR_DIR}/secrets/.env"
cp -r "${APP_DIR}/.secrets/" "${DR_DIR}/secrets/dot-secrets/" 2>/dev/null || true
cp ~/.config/rclone/rclone.conf "${DR_DIR}/secrets/rclone.conf" 2>/dev/null || true

# ── 2. Nginx configs ──────────────────────────────────────────────
echo "${LOG} Copiando Nginx configs..."
mkdir -p "${DR_DIR}/nginx"
cp -r /etc/nginx/sites-enabled/ "${DR_DIR}/nginx/sites-enabled/" 2>/dev/null || true
cp /etc/nginx/nginx.conf "${DR_DIR}/nginx/nginx.conf" 2>/dev/null || true

# ── 3. SSL certificates (Let's Encrypt) ──────────────────────────
echo "${LOG} Copiando certificados SSL..."
mkdir -p "${DR_DIR}/ssl"
cp -rL /etc/letsencrypt/ "${DR_DIR}/ssl/letsencrypt/" 2>/dev/null || true

# ── 4. Crontab ────────────────────────────────────────────────────
echo "${LOG} Salvando crontab..."
crontab -l > "${DR_DIR}/crontab.txt" 2>/dev/null || echo "# sem crontab" > "${DR_DIR}/crontab.txt"

# ── 5. Docker Compose config ─────────────────────────────────────
echo "${LOG} Copiando docker-compose..."
cp "${APP_DIR}/docker-compose.yml" "${DR_DIR}/docker-compose.yml"

# ── 6. Dump PostgreSQL — BibelôCRM ────────────────────────────────
echo "${LOG} Dump PostgreSQL bibelocrm..."
docker compose -f "${APP_DIR}/docker-compose.yml" exec -T postgres \
  pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${DR_DIR}/bibelocrm.sql.gz" \
  || echo "${LOG} [ERR] Dump bibelocrm falhou"

# ── 7. Dump PostgreSQL — Medusa ───────────────────────────────────
echo "${LOG} Dump PostgreSQL medusa_db..."
docker compose -f "${APP_DIR}/docker-compose.yml" exec -T postgres \
  pg_dump -U "${DB_USER}" medusa_db | gzip > "${DR_DIR}/medusa_db.sql.gz" 2>/dev/null \
  || echo "${LOG} [SKIP] Dump medusa_db falhou ou não existe"

# ── 8. Redis dump ─────────────────────────────────────────────────
echo "${LOG} Copiando Redis dump..."
# Força salvamento antes de copiar
REDIS_PASS=$(grep '^REDIS_PASS=' "${APP_DIR}/.env" | cut -d= -f2-)
docker compose -f "${APP_DIR}/docker-compose.yml" exec -T redis redis-cli -a "${REDIS_PASS}" BGSAVE 2>/dev/null || true
sleep 2
cp "${APP_DIR}/data/redis/dump.rdb" "${DR_DIR}/redis-dump.rdb" 2>/dev/null \
  || echo "${LOG} [SKIP] Redis dump não encontrado"

# ── 9. UFW rules ──────────────────────────────────────────────────
echo "${LOG} Salvando regras firewall..."
ufw status verbose > "${DR_DIR}/ufw-rules.txt" 2>/dev/null || true

# ── 10. Systemd services customizados ─────────────────────────────
echo "${LOG} Salvando services..."
mkdir -p "${DR_DIR}/systemd"
cp /etc/systemd/system/bibelo* "${DR_DIR}/systemd/" 2>/dev/null || true
cp /etc/systemd/system/uptime* "${DR_DIR}/systemd/" 2>/dev/null || true

# ── 11. Inventário do sistema (para referência) ──────────────────
echo "${LOG} Gerando inventário..."
{
  echo "=== DR Backup BibelôCRM — ${DATE} ==="
  echo ""
  echo "--- Containers ---"
  docker compose -f "${APP_DIR}/docker-compose.yml" ps 2>/dev/null
  echo ""
  echo "--- Imagens Docker ---"
  docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' 2>/dev/null | grep -i bibelo
  echo ""
  echo "--- Disco ---"
  df -h /
  echo ""
  echo "--- Node ---"
  node --version 2>/dev/null
  echo ""
  echo "--- OS ---"
  cat /etc/os-release | head -5
  echo ""
  echo "--- Domínios SSL ---"
  ls /etc/letsencrypt/live/ 2>/dev/null | grep -v README
} > "${DR_DIR}/inventario.txt" 2>/dev/null

# ── Compactar tudo ────────────────────────────────────────────────
echo "${LOG} Compactando..."
tar -czf "${DR_FILE}" -C /tmp "dr_${DATE}"
SIZE=$(du -sh "${DR_FILE}" | cut -f1)
echo "${LOG} Arquivo: ${DR_FILE} (${SIZE})"

# ── Upload para Google Drive ──────────────────────────────────────
if command -v rclone &>/dev/null && rclone listremotes 2>/dev/null | grep -q "${GDRIVE_REMOTE}:"; then
  echo "${LOG} Enviando para Google Drive..."
  rclone copy "${DR_FILE}" "${GDRIVE_REMOTE}:${GDRIVE_DR_FOLDER}/" --quiet 2>/dev/null \
    && echo "${LOG} [OK] Upload Google Drive concluído (${SIZE})" \
    || echo "${LOG} [ERR] Falha no upload Google Drive"

  # Limpa DR antigos no Drive
  rclone delete "${GDRIVE_REMOTE}:${GDRIVE_DR_FOLDER}/" --min-age "${DR_RETENTION_DAYS}d" --quiet 2>/dev/null || true
else
  echo "${LOG} [SKIP] rclone não configurado"
fi

# ── Limpeza local ─────────────────────────────────────────────────
rm -rf "${DR_DIR}"
# Mantém apenas os 2 últimos DR locais
ls -t "${APP_DIR}"/backups/dr_*.tar.gz 2>/dev/null | tail -n +3 | xargs rm -f 2>/dev/null || true

echo "${LOG} Disaster Recovery concluído! (${SIZE})"
echo "${LOG} Conteúdo: .env, secrets, nginx, SSL, crontab, PostgreSQL (crm+medusa), Redis, UFW, inventário"
