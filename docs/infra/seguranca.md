# BibelôCRM — Infraestrutura & Segurança

> Última atualização: 09/04/2026

---

## VPS Hostinger

- **OS:** Ubuntu 24.04
- **IP:** 185.173.111.171
- **Domínio:** crm.papelariabibelo.com.br

---

## Firewall (UFW)

```
Política padrão:
  incoming  → DENY
  outgoing  → ALLOW

Portas abertas:
  60222/tcp SSH (porta alta — alterada de 22 em 09/04/2026)
  80/tcp    HTTP (redirect → 443)
  443/tcp   HTTPS

Portas bloqueadas explicitamente:
  22/tcp    SSH antigo (removido após migração para 60222)
  5432/tcp  PostgreSQL (acesso interno via Docker)
  6379/tcp  Redis (acesso interno via Docker)
  4000/tcp  API (acesso via Nginx reverse proxy)
  3000/tcp  Frontend (acesso via Nginx reverse proxy)
```

**Resumo:** Somente SSH e tráfego web chegam ao servidor. Banco, cache e aplicações ficam isolados atrás do Nginx.

---

## SSH Hardening (09/04/2026)

```ini
# /etc/ssh/sshd_config.d/10-hardening.conf
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30

# /etc/ssh/sshd_config.d/50-cloud-init.conf
PasswordAuthentication no

# /etc/ssh/sshd_config.d/60-cloudimg-settings.conf
PasswordAuthentication no
```

**Resumo:** Autenticação só por chave SSH. X11 desabilitado. 3 tentativas máximas. Janela de login 30s.

### SSH porta 60222 (09/04/2026)

Porta SSH migrada de 22 para 60222 (porta alta) — elimina 99% dos bots que varrem porta padrão.

```ini
# /etc/ssh/sshd_config.d/05-port.conf
Port 60222

# /etc/systemd/system/ssh.socket.d/override.conf (Ubuntu 24.04 usa socket activation)
[Socket]
ListenStream=
ListenStream=0.0.0.0:60222
ListenStream=[::]:60222
```

**Acesso:** `ssh -p 60222 root@187.77.254.241`
**Fallback:** Painel VNC da Hostinger (não depende de porta SSH)

### Fail2ban SSH — Ban Permanente (09/04/2026)

```ini
[sshd]
maxretry  = 1       # 1 tentativa = ban
bantime   = -1      # permanente (nunca expira)
findtime  = 60
ignoreip  = 127.0.0.0/8 186.226.157.81 163.116.233.0/24 187.85.161.0/24
```

**Gestão via CRM:** página `/sistema` permite adicionar/remover IPs da whitelist e desbanir IPs bloqueados.
Ações são escritas em `data/firewall-pending.json` e processadas pelo script `scripts/firewall-stats.sh` (cron 1 min).

**Fail2ban jail.local:**
```ini
[sshd]
enabled   = true
port      = 60222
maxretry  = 1
findtime  = 60
bantime   = -1
ignoreip  = 127.0.0.0/8 186.226.157.81 163.116.233.0/24 187.85.161.0/24
```

### Swap (09/04/2026)

```
/swapfile  2 GB  swappiness=10
```

Persistente via `/etc/fstab`. Swappiness baixo = só usa swap em emergência (OOM).

### MOTD Banner

Banner ASCII "BIBELÔ" exibido em todo login SSH.
Arquivo: `/etc/update-motd.d/01-bibelo`

### Monitoramento do Sistema (09/04/2026)

Script `scripts/system-stats.sh` gera JSON com métricas da VPS a cada minuto via cron.
Arquivo: `/opt/bibelocrm/data/system-stats.json` (montado read-only no container da API).

**Métricas coletadas:** disco, RAM, swap, containers Docker (status + mem + cpu), certificados SSL (dias restantes), git (commits, último commit), linhas de código por camada.

**Alertas automáticos na página /sistema do CRM:**
- Disco >= 75% → warning, >= 90% → critical
- RAM >= 75% → warning, >= 90% → critical
- Swap >= 50% → warning
- Container unhealthy → warning
- SSL <= 30 dias → warning, <= 7 dias → critical

**Cron:** `* * * * *` — `/bin/bash /opt/bibelocrm/scripts/system-stats.sh`
**Frontend:** auto-refresh a cada 30 segundos

---

## Fail2ban

```ini
[DEFAULT]
bantime  = 3600        # 1 hora de ban
findtime = 600         # janela de 10 minutos
maxretry = 5           # 5 tentativas

[sshd]
enabled = true

[nginx-http-auth]
enabled = true
port    = http,https

[nginx-limit-req]
enabled  = true
port     = http,https
maxretry = 10
```

---

## Nginx — Reverse Proxy + SSL

### Segurança

| Header | Valor |
|--------|-------|
| X-Frame-Options | SAMEORIGIN |
| X-Content-Type-Options | nosniff |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| Strict-Transport-Security | max-age=31536000; includeSubDomains |
| server_tokens | off (versão Nginx oculta) |

### SSL/TLS

- Certificado: Let's Encrypt (certbot)
- Protocolos: TLSv1.2 + TLSv1.3
- Ciphers: ECDHE-ECDSA-AES128-GCM-SHA256, ECDHE-RSA-AES128-GCM-SHA256, etc.
- Session cache: 10m compartilhado

### Rate Limiting (Nginx)

| Zona | Rate | Burst | Uso |
|------|------|-------|-----|
| api | 30 req/min por IP | 20 | Todas as rotas /api/* (CRM) |
| login | 5 req/min por IP | 10 | /api/auth/login (CRM) |
| tracking | 20 req/min por IP | 10 | /api/tracking/* (webhook) |
| leads | 10 req/min por IP | 5 | /api/leads/* (webhook) |
| landing | 30 req/min por IP | 15 | /lp/* (webhook) |
| homolog_auth | 5 req/min por IP | 3 | /api/auth/* (homolog) |

### Rotas do Proxy

| Path | Destino | Notas |
|------|---------|-------|
| `/` | `127.0.0.1:3000` | Frontend React |
| `/api/` | `127.0.0.1:4000` | API Node.js (rate limit: api) |
| `/api/webhooks/` | `127.0.0.1:4000` | Webhooks NuvemShop (sem rate limit extra) |
| `~ /\.(env\|git\|htaccess)` | DENY 404 | Bloqueia arquivos sensíveis |

---

## Docker — Rede interna

```
Rede: bibelo_network (bridge)
Subnet: 172.21.0.0/16
```

### Port bindings (todos localhost-only)

| Container | Porta interna | Binding externo |
|-----------|---------------|-----------------|
| bibelo_api | 4000 | 127.0.0.1:4000 |
| bibelo_frontend | 3000 | 127.0.0.1:3000 |
| bibelo_medusa | 9000 | 127.0.0.1:9000 |
| bibelo_storefront | 8000 | 127.0.0.1:8000 |
| bibelo_storefront_v2 | 8001 | 127.0.0.1:8001 |
| bibelo_uptime | 3001 | 127.0.0.1:3001 |
| bibelo_postgres | 5432 | nenhum |
| bibelo_redis | 6379 | nenhum |

**Nenhum container expõe porta diretamente para a internet.** Tudo passa pelo Nginx.

### Limites de recursos (09/04/2026)

| Container | RAM máx | CPU máx |
|-----------|---------|---------|
| postgres | 1536M | 0.8 |
| redis | 300M | 0.3 |
| api | 1024M | 0.8 |
| frontend | 256M | 0.3 |
| medusa | 1536M | 0.8 |
| storefront | 512M | 0.5 |
| storefront-v2 | 512M | 0.5 |
| uptime | 256M | 0.2 |

**Total alocado:** ~5.9 GB / 8 GB — reserva de ~2 GB para o SO.

---

## Rate Limiting — camadas

O rate limiting está em 3 camadas:

1. **Nginx** — 30 req/min geral, 5 req/min login, 20 req/min tracking, 10 req/min leads, 30 req/min landing pages
2. **Express** — 120 req/min global, 10 req/15min no /api/auth/login
3. **Bling API** — 60 req/min (controlado no código de sync)

---

## DNS (Cloudflare)

Domínio: `papelariabibelo.com.br`

### Registros principais

| Tipo | Nome | Destino | Notas |
|------|------|---------|-------|
| A | crm | 185.173.111.171 | BibelôCRM |
| A | homolog | 185.173.111.171 | Homologação |
| A | loja | 185.173.111.171 | Loja |
| A | sublimacao | 185.173.111.171 | Sublimação |
| CNAME | inmail | inmail.tiendanube.net | NuvemShop |

### E-mail (Resend + Hostinger)

| Tipo | Nome | Destino | Notas |
|------|------|---------|-------|
| TXT | resend._domainkey | (chave DKIM Resend) | DKIM para Resend |
| TXT | scph0226._domainkey | (chave DKIM Hostinger) | DKIM para Hostinger |

> Registros da Edrone removidos em 09/04/2026: edrone._domainkey, edrone-mail, click, sms, sparkpost.edrone-click.

### SPF

```
v=spf1 include:_spf.mail.hostinger.com include:send.resend.com -all
```

- `_spf.mail.hostinger.com` — email corporativo (contato@)
- `send.resend.com` — email marketing (marketing@) via Resend
- `-all` — rejeita servidores não autorizados (hardfail)

### DMARC

```
v=DMARC1; p=reject; rua=mailto:contato@papelariabibelo.com.br
```

- `p=reject` — emails que falham SPF/DKIM são **rejeitados** (atualizado 09/04/2026, antes era quarantine)
- Relatórios de abuso enviados para `contato@papelariabibelo.com.br`

---

## Deploy (GitHub Actions)

```
git push origin main
  → GitHub Actions build
  → rsync via SSH para /opt/bibelocrm
  → docker compose up -d --build
  → curl health check HTTPS
  → notificação (planejada)
```

Exclusões do rsync: `.git`, `node_modules`, `.env`, `data/`, `backups/`, `logs/`

---

## Resumo das camadas de segurança

```
Internet
  │
  ├─ Cloudflare (DNS + proxy opcional)
  │
  ├─ UFW: só 22, 80, 443
  │
  ├─ Fail2ban: ban por brute force
  │
  ├─ Nginx: SSL + headers + rate limit
  │
  ├─ Docker: rede isolada, ports localhost-only
  │
  ├─ Express: helmet + rate limit + JWT
  │
  └─ App: Zod validation + parameterized SQL + HMAC webhooks
```
