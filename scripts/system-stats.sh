#!/bin/bash
# Gera JSON com stats do sistema para a API ler
# Roda no HOST via cron a cada minuto

OUT="/opt/bibelocrm/data/system-stats.json"
BASE="/opt/bibelocrm"

# Disk
DISK_TOTAL=$(df -h / | tail -1 | awk '{print $2}')
DISK_USED=$(df -h / | tail -1 | awk '{print $3}')
DISK_AVAIL=$(df -h / | tail -1 | awk '{print $4}')
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')

# Memory
MEM_TOTAL=$(free -m | grep Mem | awk '{print $2}')
MEM_USED=$(free -m | grep Mem | awk '{print $3}')
MEM_AVAIL=$(free -m | grep Mem | awk '{print $7}')
MEM_PCT=$((MEM_USED * 100 / MEM_TOTAL))

# Swap
SWAP_TOTAL=$(free -h | grep Swap | awk '{print $2}')
SWAP_USED=$(free -h | grep Swap | awk '{print $3}')
SWAP_TOTAL_M=$(free -m | grep Swap | awk '{print $2}')
SWAP_USED_M=$(free -m | grep Swap | awk '{print $3}')
SWAP_PCT=0
[ "$SWAP_TOTAL_M" -gt 0 ] 2>/dev/null && SWAP_PCT=$((SWAP_USED_M * 100 / SWAP_TOTAL_M))

# System
HOSTNAME=$(hostname)
PLATFORM=$(lsb_release -d -s 2>/dev/null || grep PRETTY_NAME /etc/os-release | cut -d'"' -f2)
UPTIME=$(cat /proc/uptime | awk '{print int($1)}')
CPUS=$(nproc)
LOAD1=$(cat /proc/loadavg | awk '{print $1}')
LOAD5=$(cat /proc/loadavg | awk '{print $2}')
LOAD15=$(cat /proc/loadavg | awk '{print $3}')

# Containers
CONTAINERS="["
FIRST=true
while IFS='|' read -r NAME STATUS; do
  [ -z "$NAME" ] && continue
  HEALTHY="false"
  echo "$STATUS" | grep -q "(healthy)" && HEALTHY="true"
  # Get stats
  STATS=$(docker stats --no-stream --format '{{.MemUsage}}|{{.CPUPerc}}' "$NAME" 2>/dev/null)
  MEM=$(echo "$STATS" | cut -d'|' -f1 | cut -d'/' -f1 | xargs)
  CPU=$(echo "$STATS" | cut -d'|' -f2 | xargs)
  [ -z "$MEM" ] && MEM="?"
  [ -z "$CPU" ] && CPU="?"

  $FIRST || CONTAINERS+=","
  FIRST=false
  CONTAINERS+="{\"name\":\"$NAME\",\"status\":\"$STATUS\",\"healthy\":$HEALTHY,\"memory\":\"$MEM\",\"cpu\":\"$CPU\"}"
done < <(docker compose -f "$BASE/docker-compose.yml" ps --format '{{.Name}}|{{.Status}}' 2>/dev/null)
CONTAINERS+="]"

# SSL Certs
CERTS="["
FIRST=true
CERT_RAW=$(certbot certificates 2>/dev/null)
while read -r DOMAIN; do
  EXPIRY_LINE=$(echo "$CERT_RAW" | grep -A1 "Domains: $DOMAIN" | grep "Expiry")
  DAYS=$(echo "$EXPIRY_LINE" | grep -oP 'VALID:\s+\K\d+')
  EXPIRY=$(echo "$EXPIRY_LINE" | grep -oP 'Expiry Date:\s+\K[\d-]+ [\d:]+')
  [ -z "$DAYS" ] && DAYS=0
  [ -z "$EXPIRY" ] && EXPIRY="desconhecido"
  $FIRST || CERTS+=","
  FIRST=false
  CERTS+="{\"domain\":\"$DOMAIN\",\"expiry\":\"$EXPIRY\",\"days\":$DAYS}"
done < <(echo "$CERT_RAW" | grep "Domains:" | awk '{print $2}')
CERTS+="]"

# Git
GIT_COMMITS=$(git -C "$BASE" log --oneline 2>/dev/null | wc -l)
GIT_LAST=$(git -C "$BASE" log -1 --format='%h %s' 2>/dev/null | sed 's/"/\\"/g')
GIT_DATE=$(git -C "$BASE" log -1 --format='%ci' 2>/dev/null)

# Code stats
count_lines() {
  find "$1" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.css" -o -name "*.sql" -o -name "*.sh" \) 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}'
}
count_files() {
  find "$1" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.css" -o -name "*.sql" -o -name "*.sh" \) 2>/dev/null | wc -l
}

API_LINES=$(count_lines "$BASE/api/src")
FRONT_LINES=$(count_lines "$BASE/frontend/src")
STORE_LINES=$(count_lines "$BASE/storefront-v2/src")
MEDUSA_LINES=$(count_lines "$BASE/medusa/src")
MIGRATE_LINES=$(count_lines "$BASE/db/migrations")
SCRIPT_LINES=$(count_lines "$BASE/scripts")
TOTAL_LINES=$((API_LINES + FRONT_LINES + STORE_LINES + MEDUSA_LINES + MIGRATE_LINES + SCRIPT_LINES))
TOTAL_FILES=$(($(count_files "$BASE/api/src") + $(count_files "$BASE/frontend/src") + $(count_files "$BASE/storefront-v2/src") + $(count_files "$BASE/medusa/src") + $(count_files "$BASE/db/migrations") + $(count_files "$BASE/scripts")))

# Write JSON
cat > "$OUT" << ENDJSON
{
  "hostname": "$HOSTNAME",
  "platform": "$PLATFORM",
  "uptime_seconds": $UPTIME,
  "cpus": $CPUS,
  "load_avg": {"1m": $LOAD1, "5m": $LOAD5, "15m": $LOAD15},
  "disk": {"total": "$DISK_TOTAL", "used": "$DISK_USED", "avail": "$DISK_AVAIL", "pct": $DISK_PCT},
  "memory": {"total": $MEM_TOTAL, "used": $MEM_USED, "available": $MEM_AVAIL, "pct": $MEM_PCT},
  "swap": {"total": "$SWAP_TOTAL", "used": "$SWAP_USED", "pct": $SWAP_PCT},
  "containers": $CONTAINERS,
  "certs": $CERTS,
  "git": {"commits": $GIT_COMMITS, "last_commit": "$GIT_LAST", "last_date": "$GIT_DATE"},
  "code": {
    "total_lines": $TOTAL_LINES,
    "total_files": $TOTAL_FILES,
    "by_layer": {
      "API (backend)": $API_LINES,
      "Frontend (React)": $FRONT_LINES,
      "Storefront v2": $STORE_LINES,
      "Medusa (custom)": $MEDUSA_LINES,
      "Migrations (SQL)": $MIGRATE_LINES,
      "Scripts": $SCRIPT_LINES
    }
  },
  "generated_at": "$(date -Iseconds)"
}
ENDJSON
