#!/bin/bash
# Coleta stats de firewall/SSH e processa ações pendentes do CRM
# Roda no HOST via cron a cada minuto

OUT="/opt/bibelocrm/data/firewall-stats.json"
PENDING="/opt/bibelocrm/data/firewall-pending.json"

# ── Processar ações pendentes do CRM ──────────────────────────
if [ -f "$PENDING" ] && [ -s "$PENDING" ]; then
  while IFS= read -r action; do
    ACT=$(echo "$action" | python3 -c "import sys,json; print(json.load(sys.stdin).get('action',''))" 2>/dev/null)
    IP=$(echo "$action" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ip',''))" 2>/dev/null)
    LABEL=$(echo "$action" | python3 -c "import sys,json; print(json.load(sys.stdin).get('label',''))" 2>/dev/null)

    case "$ACT" in
      add)
        ufw allow from "$IP" to any port 22 comment "SSH - $LABEL (via CRM)" 2>/dev/null
        # Adicionar ao ignoreip do Fail2ban
        CURRENT_IGNORE=$(fail2ban-client get sshd ignoreip 2>/dev/null | grep -oP '\d+\.\d+\.\d+\.\d+[/\d]*' | tr '\n' ' ')
        if ! echo "$CURRENT_IGNORE" | grep -q "$IP"; then
          fail2ban-client set sshd addignoreip "$IP" 2>/dev/null
        fi
        echo "$(date): ADDED $IP ($LABEL)" >> /opt/bibelocrm/logs/firewall-actions.log
        ;;
      remove)
        # Encontrar e deletar regra UFW
        RULE_NUM=$(ufw status numbered 2>/dev/null | grep "$IP" | grep "22" | head -1 | grep -oP '^\[\s*\K\d+')
        if [ -n "$RULE_NUM" ]; then
          echo "y" | ufw delete "$RULE_NUM" 2>/dev/null
        fi
        fail2ban-client set sshd delignoreip "$IP" 2>/dev/null
        echo "$(date): REMOVED $IP" >> /opt/bibelocrm/logs/firewall-actions.log
        ;;
      unban)
        fail2ban-client set sshd unbanip "$IP" 2>/dev/null
        echo "$(date): UNBANNED $IP" >> /opt/bibelocrm/logs/firewall-actions.log
        ;;
    esac
  done < <(python3 -c "
import json
with open('$PENDING') as f:
    for item in json.load(f):
        print(json.dumps(item))
" 2>/dev/null)
  echo "[]" > "$PENDING"
fi

# ── Conexões SSH ativas ───────────────────────────────────────
SSH_CONNS="["
FIRST=true
while IFS= read -r line; do
  [ -z "$line" ] && continue
  REMOTE_IP=$(echo "$line" | awk '{print $5}' | cut -d: -f1)
  REMOTE_PORT=$(echo "$line" | awk '{print $5}' | cut -d: -f2)
  PID=$(echo "$line" | grep -oP 'pid=\K\d+')
  USER=$(ps -o user= -p "$PID" 2>/dev/null | head -1)
  [ -z "$USER" ] && USER="?"
  $FIRST || SSH_CONNS+=","
  FIRST=false
  SSH_CONNS+="{\"ip\":\"$REMOTE_IP\",\"port\":$REMOTE_PORT,\"user\":\"$USER\",\"pid\":$PID}"
done < <(ss -tnp | grep ":60222" | grep ESTAB)
SSH_CONNS+="]"

# ── Regras UFW para SSH ──────────────────────────────────────
UFW_RULES="["
FIRST=true
while IFS= read -r line; do
  [ -z "$line" ] && continue
  NUM=$(echo "$line" | grep -oP '^\[\s*\K\d+')
  IP=$(echo "$line" | grep -oP 'ALLOW IN\s+\K[\d./]+')
  COMMENT=$(echo "$line" | grep -oP '#\s*\K.*' || echo "")
  [ -z "$NUM" ] || [ -z "$IP" ] && continue
  $FIRST || UFW_RULES+=","
  FIRST=false
  UFW_RULES+="{\"num\":$NUM,\"ip\":\"$IP\",\"label\":\"$COMMENT\"}"
done < <(ufw status numbered 2>/dev/null | grep "22" | grep "ALLOW")
UFW_RULES+="]"

# ── Fail2ban SSH ─────────────────────────────────────────────
F2B_STATUS=$(fail2ban-client status sshd 2>/dev/null)
F2B_BANNED=$(echo "$F2B_STATUS" | grep "Currently banned" | awk '{print $NF}')
F2B_TOTAL=$(echo "$F2B_STATUS" | grep "Total banned" | awk '{print $NF}')
F2B_FAILED=$(echo "$F2B_STATUS" | grep "Currently failed" | awk '{print $NF}')

# Lista de IPs banidos
BANNED_LIST="["
FIRST=true
for IP in $(echo "$F2B_STATUS" | grep "Banned IP list" | sed 's/.*Banned IP list:\s*//'); do
  $FIRST || BANNED_LIST+=","
  FIRST=false
  BANNED_LIST+="\"$IP\""
done
BANNED_LIST+="]"

# ── Últimas tentativas SSH (auth.log / journalctl) ──────────
RECENT_ATTEMPTS="["
FIRST=true
while IFS= read -r line; do
  [ -z "$line" ] && continue
  TS=$(echo "$line" | awk '{print $1}')
  IP=$(echo "$line" | grep -oP 'from \K[\d.]+')
  TYPE=$(echo "$line" | grep -oP '(Failed|Accepted|Invalid|Disconnected|Connection closed)' | head -1)
  USER=$(echo "$line" | grep -oP 'for (invalid user )?\K\S+' | head -1)
  [ -z "$IP" ] && continue
  $FIRST || RECENT_ATTEMPTS+=","
  FIRST=false
  RECENT_ATTEMPTS+="{\"time\":\"$TS\",\"ip\":\"$IP\",\"type\":\"${TYPE:-unknown}\",\"user\":\"${USER:-?}\"}"
done < <(journalctl -u ssh --since "24 hours ago" --no-pager -o short-iso 2>/dev/null | grep -E "(Failed|Accepted|Invalid|Disconnected|Connection closed)" | tail -50)
RECENT_ATTEMPTS+="]"

# ── Config atual ─────────────────────────────────────────────
F2B_BANTIME=$(fail2ban-client get sshd bantime 2>/dev/null)
F2B_MAXRETRY=$(fail2ban-client get sshd maxretry 2>/dev/null)
F2B_IGNOREIP=$(fail2ban-client get sshd ignoreip 2>/dev/null | tail -1 | sed 's/^[|`]- //')

# ── Escrever JSON ────────────────────────────────────────────
cat > "$OUT" << ENDJSON
{
  "ssh_connections": $SSH_CONNS,
  "ufw_rules": $UFW_RULES,
  "fail2ban": {
    "currently_banned": ${F2B_BANNED:-0},
    "total_banned": ${F2B_TOTAL:-0},
    "currently_failed": ${F2B_FAILED:-0},
    "banned_ips": $BANNED_LIST,
    "config": {
      "bantime": "${F2B_BANTIME:--1}",
      "maxretry": "${F2B_MAXRETRY:-1}",
      "ignoreip": "$F2B_IGNOREIP"
    }
  },
  "recent_attempts": $RECENT_ATTEMPTS,
  "generated_at": "$(date -Iseconds)"
}
ENDJSON
