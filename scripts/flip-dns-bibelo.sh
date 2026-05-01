#!/bin/bash
# Executado automaticamente em 11/05/2026 00:01 BRT
# Redireciona papelariabibelo.com.br para esta VPS (nginx → boasvindas)

set -euo pipefail

LOG="/var/log/flip-dns-bibelo.log"
exec >> "$LOG" 2>&1

echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') — Iniciando virada DNS papelariabibelo.com.br ==="

CF_TOKEN=$(grep CLOUDFLARE_API_TOKEN /opt/bibelocrm/.env | cut -d= -f2)
CF_ZONE=$(grep CLOUDFLARE_ZONE_ID /opt/bibelocrm/.env | cut -d= -f2)
VPS_IP="187.77.254.241"

# IDs dos dois A records (obtidos em 01/05/2026)
RECORD_IDS=(
  "2f37d4b19ccccb33708409f977348f63"
  "2cf051d871d95b2ac0d742f8e4ea772b"
)

for RID in "${RECORD_IDS[@]}"; do
  RESULT=$(curl -s -X PATCH \
    "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/dns_records/${RID}" \
    -H "Authorization: Bearer ${CF_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"${VPS_IP}\", \"proxied\": false}")

  SUCCESS=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('success', False))")
  CONTENT=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('result',{}).get('content','?'))")
  echo "  Record ${RID}: success=${SUCCESS} content=${CONTENT}"
done

# Recarregar nginx para garantir
nginx -t && systemctl reload nginx
echo "  nginx recarregado"

echo "=== Virada concluída. papelariabibelo.com.br agora aponta para ${VPS_IP} ==="
