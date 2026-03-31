# E-commerce Próprio — Papelaria Bibelô

Arquitetura headless: **Next.js** (vitrine) + **Medusa.js** (motor e-commerce) rodando no mesmo VPS.
Substitui a NuvemShop com controle total sobre UX, integrações e funcionalidades.

---

## Arquitetura

```
                         Internet
                            │
                            ▼
                    Nginx (80/443 SSL)
                     ├── papelariabibelo.com.br        →  Next.js (:3000)
                     ├── api.papelariabibelo.com.br    →  Medusa.js (:9000)
                     ├── crm.papelariabibelo.com.br    →  BibelôCRM API (:4000)
                     ├── chat.papelariabibelo.com.br   →  Chatwoot (:3001)
                     └── webhook.papelariabibelo.com.br →  Webhooks (:4000)

Portas internas (não expostas à internet):
  3000  Next.js (storefront)
  4000  BibelôCRM API
  5432  PostgreSQL
  6379  Redis
  7001  Medusa Admin (só via SSH tunnel)
  9000  Medusa API
```

### Stack

| Camada | Tecnologia | Função |
|--------|-----------|--------|
| Vitrine (frontend) | Next.js 14+ | SSG catálogo, SSR carrinho/checkout, 100% do visual |
| Motor e-commerce | Medusa.js 2.x | Headless — carrinho, pedidos, cupons, clientes, pagamento |
| CRM + Marketing | BibelôCRM (Node.js) | Clientes, fluxos, leads, tracking, campanhas |
| ERP | Bling v3 | Produtos, estoque, NF-e, financeiro |
| Pagamento | Mercado Pago | PIX, cartão, boleto — provider Medusa |
| Frete | Melhor Envio | Cálculo, etiquetas, rastreio — provider Medusa |
| Atendimento | Chatwoot | Chat no site, WhatsApp, Instagram DM |
| Banco | PostgreSQL 16 | Schemas: crm, marketing, sync, financeiro, medusa |
| Cache/Filas | Redis 7 | BullMQ + cache Medusa |
| Proxy | Nginx + SSL Let's Encrypt | Roteamento por subdomínio |
| Containers | Docker Compose | Tudo no mesmo VPS |

---

## Frontend — Next.js

- **100% da camada visual** — catálogo, produto, carrinho, checkout, conta do cliente
- **SSG (Static Site Generation)** para catálogo de produtos — performance máxima, SEO
- **SSR (Server-Side Rendering)** para carrinho e checkout — dados em tempo real
- **ISR (Incremental Static Regeneration)** — revalida páginas quando produto muda no Bling
- Consome dados via **Medusa.js REST API** (`api.papelariabibelo.com.br`)
- Design próprio — cores Bibelô (#ffe5ec, #fe68c4, #fff7c1), fonte Jost/Nunito
- Responsivo mobile-first
- Scripts integrados: tracking BibelôCRM, popup leads, widget reviews, chat Chatwoot

### Páginas principais

| Página | Rota | Renderização |
|--------|------|-------------|
| Home | `/` | SSG + ISR |
| Catálogo / Categoria | `/produtos`, `/categoria/:slug` | SSG + ISR |
| Produto | `/produto/:slug` | SSG + ISR |
| Busca | `/busca?q=` | SSR |
| Carrinho | `/carrinho` | SSR |
| Checkout | `/checkout` | SSR |
| Minha conta | `/conta` | SSR (auth) |
| Pedidos | `/conta/pedidos` | SSR (auth) |
| Rastreio | `/conta/pedidos/:id` | SSR (auth) |

---

## Backend — Medusa.js

Motor headless e-commerce — sem UI própria, só API REST + Admin.

### Módulos

| Módulo | Responsabilidade |
|--------|-----------------|
| Cart | Sessões persistentes, gerenciamento de itens |
| Orders | Ciclo de vida do pedido, status, histórico |
| Coupons | Regras de desconto, cupons promocionais |
| Customers | Auth, conta, histórico de compras |
| Products | Catálogo (sincronizado via Bling) |
| Pricing | Preços, promoções, regras por canal |
| Shipping | Cálculo de frete (Melhor Envio) |
| Payment | Processamento (Mercado Pago) |

### Admin Panel

- Porta 7001 (interna — **NUNCA expor à internet**)
- Acesso apenas via SSH tunnel:
  ```bash
  ssh -L 7001:localhost:7001 user@<IP_VPS>
  ```
  Depois acessar: `http://localhost:7001`

---

## Integrações externas

### Bling ERP → Medusa (produtos e estoque)

| Direção | O que | Como |
|---------|-------|------|
| Bling → Medusa | Produtos, categorias, preços, estoque | Webhook + sync periódico |
| Medusa → Bling | Pedidos confirmados | API Bling v3 (criar pedido de venda) |
| Medusa → Bling | NF-e | Solicitar emissão via API |

- Bling continua como fonte da verdade para catálogo e estoque
- Webhook do Bling chega em `webhook.papelariabibelo.com.br` → roteado ao Medusa
- Sync incremental via BullMQ (reutiliza infraestrutura existente do BibelôCRM)
- Rate limit Bling: 3 req/s — delay 350ms, retry em 429

### Mercado Pago (pagamento)

| Método | Suporte |
|--------|---------|
| PIX | Sim — pagamento instantâneo |
| Cartão de crédito | Sim — até 12x |
| Cartão de débito | Sim |
| Boleto bancário | Sim |

- Configurado como **Payment Provider** do Medusa
- Webhook de notificação: `api.papelariabibelo.com.br/hooks/mercadopago`
- Credenciais: access token + webhook secret no `.env`
- Checkout transparente (sem redirect — cliente paga no site)

### Melhor Envio (frete)

| Funcionalidade | Suporte |
|---------------|---------|
| Cálculo de frete | Sim — múltiplas transportadoras |
| Geração de etiqueta | Sim |
| Rastreio | Sim — webhook de status |
| Correios + privadas | Sim (PAC, SEDEX, Jadlog, etc.) |

- Configurado como **Fulfillment Provider** do Medusa
- Calcula frete em tempo real no checkout (CEP destino + peso/dimensões)
- Gera etiqueta após pagamento confirmado
- Webhook de rastreio atualiza status do pedido

### BibelôCRM (integração bidirecional)

| Direção | O que | Como |
|---------|-------|------|
| Medusa → CRM | Novo cliente, pedido pago, pedido entregue | Webhooks internos |
| CRM → Medusa | Cupons de fluxos automáticos | API Medusa |
| Site → CRM | Tracking (page_view, product_view, add_to_cart) | Script JS existente |
| CRM → Site | Popup leads, widget reviews | Scripts JS existentes |

- Fluxos automáticos do CRM continuam funcionando (carrinho abandonado, pós-compra, etc.)
- Tracking comportamental reutiliza o script `bibelo.js` existente
- Leads capturados no site vão direto pro CRM

### Chatwoot (atendimento)

- Widget de chat no site (já planejado em `docs/whatsapp-oficial-chatwoot.md`)
- WhatsApp + Instagram DM no mesmo painel
- Integração com CRM (timeline do cliente)

---

## Docker Compose — Serviços

| Serviço | Porta interna | Exposto ao host | Exposto à internet |
|---------|--------------|----------------|-------------------|
| postgres | 5432 | Não | Não |
| redis | 6379 | Não | Não |
| medusa | 9000 + 7001 | localhost only | Via Nginx (só 9000) |
| nextjs | 3000 | localhost only | Via Nginx |
| api (BibelôCRM) | 4000 | localhost only | Via Nginx |
| chatwoot | 3001 | localhost only | Via Nginx |
| nginx | 80 + 443 | Sim | Sim |

### docker-compose.yml (serviços novos)

```yaml
services:
  # ... serviços existentes (postgres, redis, api, frontend CRM) ...

  medusa:
    build: ./medusa
    container_name: bibelo_medusa
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - DATABASE_URL=postgresql://bibelocrm:${POSTGRES_PASSWORD}@postgres:5432/medusa
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/2
      - MEDUSA_ADMIN_CORS=${MEDUSA_ADMIN_CORS}
      - STORE_CORS=${STORE_CORS}
      - MERCADOPAGO_ACCESS_TOKEN=${MERCADOPAGO_ACCESS_TOKEN}
      - MERCADOPAGO_WEBHOOK_SECRET=${MERCADOPAGO_WEBHOOK_SECRET}
      - MELHOR_ENVIO_TOKEN=${MELHOR_ENVIO_TOKEN}
      - BLING_CLIENT_ID=${BLING_CLIENT_ID}
      - BLING_CLIENT_SECRET=${BLING_CLIENT_SECRET}
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:7001:7001"
    restart: unless-stopped
    networks:
      - bibelo_net

  storefront:
    build: ./storefront
    container_name: bibelo_storefront
    depends_on:
      - medusa
    environment:
      - NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api.papelariabibelo.com.br
      - NEXT_PUBLIC_SITE_URL=https://www.papelariabibelo.com.br
      - NEXT_PUBLIC_CRM_URL=https://webhook.papelariabibelo.com.br
    ports:
      - "127.0.0.1:3000:3000"
    restart: unless-stopped
    networks:
      - bibelo_net
```

---

## Nginx — Reverse Proxy

```nginx
# Storefront (site público)
server {
    server_name papelariabibelo.com.br www.papelariabibelo.com.br;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/papelariabibelo.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/papelariabibelo.com.br/privkey.pem;
}

# Medusa API (backend e-commerce)
server {
    server_name api.papelariabibelo.com.br;

    location / {
        proxy_pass http://localhost:9000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/api.papelariabibelo.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.papelariabibelo.com.br/privkey.pem;
}
```

---

## Variáveis de ambiente

```env
# Medusa
DATABASE_URL=postgresql://bibelocrm:SENHA@postgres:5432/medusa
REDIS_URL=redis://:SENHA@redis:6379/2
MEDUSA_ADMIN_CORS=https://crm.papelariabibelo.com.br
STORE_CORS=https://www.papelariabibelo.com.br

# Next.js (storefront)
NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api.papelariabibelo.com.br
NEXT_PUBLIC_SITE_URL=https://www.papelariabibelo.com.br
NEXT_PUBLIC_CRM_URL=https://webhook.papelariabibelo.com.br

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=

# Melhor Envio
MELHOR_ENVIO_TOKEN=

# Bling (já existentes no .env)
# BLING_CLIENT_ID=
# BLING_CLIENT_SECRET=
```

---

## Segurança

### Portas — apenas 80 e 443 abertas ao público

| Porta | Status | Motivo |
|-------|--------|--------|
| 80 | Aberta | Redirect HTTP → HTTPS |
| 443 | Aberta | HTTPS (Nginx) |
| 3000 | Fechada | Next.js — só localhost |
| 4000 | Fechada | BibelôCRM API — só localhost |
| 5432 | Fechada | PostgreSQL — só rede Docker |
| 6379 | Fechada | Redis — só rede Docker |
| 7001 | Fechada | Medusa Admin — só SSH tunnel |
| 9000 | Fechada | Medusa API — só localhost |

### Medusa Admin (7001)

**NUNCA expor à internet.** Acesso exclusivo via SSH tunnel:

```bash
ssh -L 7001:localhost:7001 root@<IP_VPS>
# Acessar: http://localhost:7001
```

### Webhooks

Bling e Mercado Pago enviam webhooks via HTTPS (443) → Nginx roteia ao Medusa (9000).
Validação HMAC obrigatória em todos os webhooks.

---

## Getting Started

```bash
# 1. Clonar o repositório
git clone https://github.com/carloseduardomcosta/bibelo_ecossistema.git
cd bibelo_ecossistema

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Preencher todas as variáveis

# 3. Subir toda a stack
docker compose up -d

# 4. Criar banco do Medusa
docker compose exec medusa npx medusa db:create
docker compose exec medusa npx medusa db:migrate

# 5. Criar admin do Medusa
docker compose exec medusa npx medusa user -e admin@papelariabibelo.com.br -p SENHA

# 6. Verificar saúde
curl -s https://www.papelariabibelo.com.br  # Next.js
curl -s https://api.papelariabibelo.com.br/health  # Medusa
curl -s https://crm.papelariabibelo.com.br/health  # BibelôCRM

# 7. Acessar admin (via SSH tunnel)
ssh -L 7001:localhost:7001 root@<IP_VPS>
# Abrir http://localhost:7001
```

---

## Migração NuvemShop → Site Próprio

### Dados a migrar

| Dado | Origem | Destino |
|------|--------|---------|
| Produtos + fotos | Bling (fonte da verdade) | Medusa (sync automático) |
| Clientes | BibelôCRM (já unificados) | Medusa Customers |
| Histórico de pedidos | Bling + NuvemShop | Medusa Orders (importação) |
| Cupons ativos | NuvemShop | Medusa Coupons |
| URLs (SEO) | NuvemShop | Next.js (redirects 301) |

### Estratégia de migração

1. **Fase 1** — Construir site em paralelo (subdomínio staging)
2. **Fase 2** — Migrar dados (clientes, pedidos, cupons)
3. **Fase 3** — Redirects 301 de URLs antigas
4. **Fase 4** — Apontar DNS `papelariabibelo.com.br` para Next.js
5. **Fase 5** — Desativar NuvemShop

### DNS pós-migração

```
papelariabibelo.com.br       A    <IP_VPS>   (site próprio)
www.papelariabibelo.com.br   A    <IP_VPS>   (site próprio)
api.papelariabibelo.com.br   A    <IP_VPS>   (Medusa API)
crm.papelariabibelo.com.br   A    <IP_VPS>   (BibelôCRM)
chat.papelariabibelo.com.br  A    <IP_VPS>   (Chatwoot)
webhook.papelariabibelo.com.br A  <IP_VPS>   (Webhooks Bling/MP)
menu.papelariabibelo.com.br  A    <IP_VPS>   (Página de links)
```

---

## TODO

- [ ] Avaliar se o VPS atual aguenta a stack completa (RAM, CPU) — pode precisar upgrade
- [ ] Definir se Medusa usa mesmo PostgreSQL do CRM (banco separado) ou instância separada
- [ ] Pesquisar plugins Medusa para Mercado Pago e Melhor Envio (ou desenvolver custom)
- [ ] Definir design system completo (Figma) antes de codar o frontend
- [ ] Planejar SEO: sitemap, structured data, meta tags, Open Graph
- [ ] Definir estratégia de imagens (CDN? Cloudflare R2? Otimização Next.js Image?)

---

*Documento criado em 31 de Março de 2026*
*Status: Backlog — será implementado em fase futura*
