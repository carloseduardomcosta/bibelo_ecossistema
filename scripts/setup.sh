#!/usr/bin/env bash
# BibelôCRM — Setup Ubuntu 24.04 Hostinger
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }
section() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}\n"; }

[[ $EUID -ne 0 ]] && error "Execute como root: sudo bash setup.sh"

clear
echo -e "${CYAN}${BOLD}"
echo "  ██████╗ ██╗██████╗ ███████╗██╗      ██████╗      ██████╗██████╗ ███╗   ███╗"
echo "  ██╔══██╗██║██╔══██╗██╔════╝██║     ██╔═══██╗    ██╔════╝██╔══██╗████╗ ████║"
echo "  ██████╔╝██║██████╔╝█████╗  ██║     ██║   ██║    ██║     ██████╔╝██╔████╔██║"
echo "  ██╔══██╗██║██╔══██╗██╔══╝  ██║     ██║   ██║    ██║     ██╔══██╗██║╚██╔╝██║"
echo "  ██████╔╝██║██████╔╝███████╗███████╗╚██████╔╝    ╚██████╗██║  ██║██║ ╚═╝ ██║"
echo "  ╚═════╝ ╚═╝╚═════╝ ╚══════╝╚══════╝ ╚═════╝      ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝"
echo -e "                        Ecossistema Bibelô — Setup VPS${NC}\n"

read -rp "$(echo -e ${YELLOW}Domínio do BibelôCRM [crm.papelariabibelo.com.br]:${NC} )" DOMAIN
DOMAIN=${DOMAIN:-crm.papelariabibelo.com.br}
read -rp "$(echo -e ${YELLOW}E-mail para SSL:${NC} )" SSL_EMAIL
read -rsp "$(echo -e ${YELLOW}Senha do banco PostgreSQL [mín. 12 chars]:${NC} )" DB_PASS; echo ""
read -rsp "$(echo -e ${YELLOW}JWT Secret [mín. 32 chars]:${NC} )" JWT_SECRET; echo ""

[[ ${#DB_PASS} -lt 12 ]]    && error "Senha do banco precisa ter pelo menos 12 caracteres"
[[ ${#JWT_SECRET} -lt 32 ]] && error "JWT secret precisa ter pelo menos 32 caracteres"

APP_DIR="/opt/bibelocrm"

section "1/6 — Sistema base"
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git unzip ca-certificates gnupg lsb-release \
  ufw fail2ban htop nano net-tools jq cron logrotate rclone
log "Sistema atualizado"

section "2/6 — Docker"
if command -v docker &>/dev/null; then
  warn "Docker já instalado — pulando"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker && systemctl start docker
  log "Docker instalado"
fi
docker compose version &>/dev/null && log "Docker Compose OK" || error "Docker Compose falhou"

section "3/6 — Firewall UFW"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw deny  5432/tcp comment 'PostgreSQL interno'
ufw deny  6379/tcp comment 'Redis interno'
ufw deny  4000/tcp comment 'API via Nginx'
ufw deny  3000/tcp comment 'Frontend via Nginx'
ufw --force enable
log "UFW ativo — aberto: 22, 80, 443"

section "4/6 — Fail2ban"
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
logpath  = %(sshd_log)s

[nginx-http-auth]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/error.log

[nginx-limit-req]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/error.log
maxretry = 10
EOF
systemctl enable fail2ban && systemctl restart fail2ban
log "Fail2ban configurado"

section "5/6 — Nginx + SSL Let's Encrypt"
apt-get install -y -qq nginx certbot python3-certbot-nginx
systemctl enable nginx

cat > /etc/nginx/nginx.conf << 'EOF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;
events { worker_connections 1024; multi_accept on; }
http {
  sendfile on; tcp_nopush on; server_tokens off;
  types_hash_max_size 2048;
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  access_log /var/log/nginx/access.log;
  error_log  /var/log/nginx/error.log warn;
  add_header X-Frame-Options        "SAMEORIGIN"   always;
  add_header X-Content-Type-Options "nosniff"      always;
  add_header X-XSS-Protection       "1; mode=block" always;
  add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
  limit_req_zone $binary_remote_addr zone=api:10m   rate=30r/m;
  limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
  gzip on; gzip_vary on; gzip_min_length 1024;
  gzip_types text/plain text/css application/json application/javascript;
  include /etc/nginx/conf.d/*.conf;
  include /etc/nginx/sites-enabled/*;
}
EOF

mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

cat > /etc/nginx/sites-available/bibelocrm << NGINXEOF
server {
  listen 80;
  server_name ${DOMAIN};
  return 301 https://\$host\$request_uri;
}
server {
  listen 443 ssl http2;
  server_name ${DOMAIN};
  ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
  ssl_protocols       TLSv1.2 TLSv1.3;
  ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
  ssl_prefer_server_ciphers off;
  ssl_session_cache   shared:SSL:10m;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade \$http_upgrade;
    proxy_set_header   Connection 'upgrade';
    proxy_set_header   Host \$host;
    proxy_set_header   X-Real-IP \$remote_addr;
    proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto \$scheme;
    proxy_cache_bypass \$http_upgrade;
  }
  location /api/ {
    limit_req zone=api burst=20 nodelay;
    proxy_pass         http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header   Host \$host;
    proxy_set_header   X-Real-IP \$remote_addr;
    proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto \$scheme;
    proxy_read_timeout 30s;
  }
  location /api/webhooks/ {
    proxy_pass         http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header   Host \$host;
    proxy_set_header   X-Real-IP \$remote_addr;
    proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto \$scheme;
  }
  location ~ /\.(env|git|htaccess) { deny all; return 404; }
  access_log /var/log/nginx/${DOMAIN}.access.log;
  error_log  /var/log/nginx/${DOMAIN}.error.log;
}
NGINXEOF

ln -sf /etc/nginx/sites-available/bibelocrm /etc/nginx/sites-enabled/bibelocrm
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
log "Nginx configurado"

warn "Obtendo certificado SSL para ${DOMAIN}..."
certbot --nginx -d "${DOMAIN}" --email "${SSL_EMAIL}" \
  --agree-tos --non-interactive --redirect
log "SSL Let's Encrypt ativo"

section "6/6 — Estrutura e .env"
mkdir -p "${APP_DIR}"/{data/postgres,data/redis,data/evolution,data/uptime,logs,backups,secrets}
chmod 700 "${APP_DIR}/secrets"

REDIS_PASS=$(openssl rand -base64 32 | tr -d '/+=')
WEBHOOK_SECRET=$(openssl rand -hex 32)
INTERNAL_KEY=$(openssl rand -hex 24)

cat > "${APP_DIR}/.env" << ENVEOF
NODE_ENV=production
APP_NAME=BibelôCRM
APP_URL=https://${DOMAIN}
API_PORT=4000
FRONTEND_PORT=3000

DB_HOST=postgres
DB_PORT=5432
DB_NAME=bibelocrm
DB_USER=bibelocrm
DB_PASS=${DB_PASS}
DATABASE_URL=postgresql://bibelocrm:${DB_PASS}@postgres:5432/bibelocrm

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASS=${REDIS_PASS}
REDIS_URL=redis://:${REDIS_PASS}@redis:6379

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=30d

NUVEMSHOP_WEBHOOK_SECRET=${WEBHOOK_SECRET}
BLING_CLIENT_ID=PREENCHER
BLING_CLIENT_SECRET=PREENCHER
BLING_REDIRECT_URI=https://${DOMAIN}/api/auth/bling/callback

RESEND_API_KEY=PREENCHER
EMAIL_FROM=noreply@${DOMAIN}
EMAIL_REPLY_TO=contato@papelariabibelo.com.br

EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_API_KEY=PREENCHER
EVOLUTION_INSTANCE=bibelocrm

BACKUP_DIR=/opt/bibelocrm/backups
R2_BUCKET=bibelocrm-backups
R2_ACCOUNT_ID=PREENCHER
R2_ACCESS_KEY=PREENCHER
R2_SECRET_KEY=PREENCHER

INTERNAL_NOTIFY_KEY=${INTERNAL_KEY}
ENVEOF

chmod 600 "${APP_DIR}/.env"
log ".env criado em ${APP_DIR}/.env"

# Cron de backup
cat > /etc/cron.d/bibelocrm-backup << 'CRONEOF'
0 3 * * * root /opt/bibelocrm/scripts/backup.sh >> /opt/bibelocrm/logs/backup.log 2>&1
0 4 * * 0 root find /opt/bibelocrm/logs -name "*.log" -mtime +30 -delete
CRONEOF
chmod 644 /etc/cron.d/bibelocrm-backup
log "Backup automático às 3h configurado"

# Logrotate
cat > /etc/logrotate.d/bibelocrm << 'LOGEOF'
/opt/bibelocrm/logs/*.log {
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  create 0640 root root
}
LOGEOF

section "Setup concluído! 🎀"
echo ""
echo -e "  Próximos passos:"
echo -e "  1. Edite o .env:       nano ${APP_DIR}/.env"
echo -e "  2. Suba os containers: cd ${APP_DIR} && docker compose up -d"
echo -e "  3. Acesse:             https://${DOMAIN}"
echo ""
echo -e "  .env:    ${APP_DIR}/.env"
echo -e "  Logs:    ${APP_DIR}/logs/"
echo -e "  Backups: ${APP_DIR}/backups/"
