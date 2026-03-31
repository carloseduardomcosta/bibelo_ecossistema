# BibelôCRM — Infraestrutura & Segurança

> Última atualização: 31/03/2026

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
  22/tcp    SSH
  80/tcp    HTTP (redirect → 443)
  443/tcp   HTTPS

Portas bloqueadas explicitamente:
  5432/tcp  PostgreSQL (acesso interno via Docker)
  6379/tcp  Redis (acesso interno via Docker)
  4000/tcp  API (acesso via Nginx reverse proxy)
  3000/tcp  Frontend (acesso via Nginx reverse proxy)
```

**Resumo:** Somente SSH e tráfego web chegam ao servidor. Banco, cache e aplicações ficam isolados atrás do Nginx.

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
| api | 30 req/min por IP | 20 | Todas as rotas /api/* |
| login | 5 req/min por IP | 10 | /api/auth/login |

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
| bibelo_uptime | 3001 | 127.0.0.1:3001 |
| bibelo_postgres | 5432 | nenhum |
| bibelo_redis | 6379 | nenhum |
| bibelo_whatsapp | 8080 | nenhum |

**Nenhum container expõe porta diretamente para a internet.** Tudo passa pelo Nginx.

---

## Rate Limiting — camadas

O rate limiting está em 3 camadas:

1. **Nginx** — 30 req/min geral, 5 req/min login
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

> Registros antigos da Edrone (edrone._domainkey, edrone-mail, click, sms) podem ser removidos.

### SPF

```
v=spf1 include:_spf.mail.hostinger.com include:send.resend.com -all
```

- `_spf.mail.hostinger.com` — email corporativo (contato@)
- `send.resend.com` — email marketing (marketing@) via Resend
- `-all` — rejeita servidores não autorizados (hardfail)

### DMARC

```
v=DMARC1; p=quarantine; rua=mailto:contato@papelariabibelo.com.br
```

- `p=quarantine` — emails que falham SPF/DKIM vão para spam
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
