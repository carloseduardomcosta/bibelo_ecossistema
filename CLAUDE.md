# CLAUDE.md — BibelôCRM

Guia completo para o agente Claude Code operar o projeto BibelôCRM.
Leia este arquivo inteiro antes de executar qualquer tarefa.

---

## Identidade do projeto

**BibelôCRM** é o CRM + Hub de Marketing da Papelaria Bibelô.
Faz parte do **Ecossistema Bibelô** — integrado com Bling ERP e NuvemShop.
Dono: Carlos Eduardo — carloseduardocostatj@gmail.com
Repositório: https://github.com/carloseduardomcosta/bibelo_ecossistema

---

## Stack técnica

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 20 + TypeScript + Express |
| Banco | PostgreSQL 16 (schemas: crm, marketing, sync, public) |
| Cache / Filas | Redis 7 + BullMQ |
| Frontend | React 18 + Vite + TypeScript |
| Containers | Docker + Docker Compose |
| Proxy | Nginx + SSL Let's Encrypt |
| E-mail | Resend SDK |
| WhatsApp | Evolution API (self-hosted) |
| Deploy | GitHub Actions → rsync → VPS Hostinger |

---

## Estrutura de diretórios
```
/opt/bibelocrm/                  ← raiz do projeto no VPS
├── api/
│   ├── src/
│   │   ├── server.ts            ← entrada principal da API
│   │   ├── routes/
│   │   │   ├── health.ts        ← GET /health
│   │   │   ├── auth.ts          ← POST /login, GET /me, POST /logout
│   │   │   ├── customers.ts     ← CRUD + timeline (5 endpoints)
│   │   │   └── analytics.ts     ← overview, revenue, segments
│   │   ├── services/
│   │   │   └── customer.service.ts ← upsert, score, timeline, segments
│   │   ├── integrations/
│   │   │   ├── bling/
│   │   │   │   ├── auth.ts      ← OAuth2 completo
│   │   │   │   └── sync.ts      ← syncCustomers, syncOrders, incremental
│   │   │   ├── nuvemshop/
│   │   │   │   └── webhook.ts   ← HMAC + processamento de eventos
│   │   │   ├── resend/          ← (pendente)
│   │   │   └── whatsapp/        ← (pendente)
│   │   ├── queues/
│   │   │   └── sync.queue.ts    ← BullMQ: sync 30min + scores 2h
│   │   ├── middleware/
│   │   │   └── auth.ts          ← JWT authMiddleware + requireAdmin
│   │   ├── db/
│   │   │   ├── index.ts         ← Pool + query/queryOne helpers
│   │   │   └── migrate.ts       ← migration runner
│   │   └── utils/
│   │       └── logger.ts        ← Winston logger
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx              ← rotas + GoogleOAuthProvider
│   │   ├── main.tsx             ← entry point + CSS import
│   │   ├── index.css            ← Tailwind directives
│   │   ├── pages/
│   │   │   ├── Login.tsx        ← login Google Sign-In
│   │   │   ├── Dashboard.tsx    ← KPIs + gráficos receita/segmentos
│   │   │   ├── Clientes.tsx     ← tabela paginada + busca + filtros
│   │   │   └── ClientePerfil.tsx ← perfil completo + score + timeline
│   │   ├── components/
│   │   │   ├── Layout.tsx       ← sidebar responsiva + Outlet
│   │   │   └── ProtectedRoute.tsx ← redirect se não autenticado
│   │   ├── hooks/               ← useCustomers, useCampaigns etc
│   │   └── lib/
│   │       ├── api.ts           ← Axios + JWT interceptor
│   │       └── auth.tsx         ← AuthContext + useAuth + Google login
│   ├── tailwind.config.js       ← tema BibelôCRM
│   ├── postcss.config.js
│   ├── Dockerfile
│   └── vite.config.ts
├── db/
│   └── migrations/              ← SQL em ordem numérica
├── scripts/
│   ├── setup.sh                 ← instalação do VPS
│   └── backup.sh                ← backup automático às 3h
├── .github/workflows/
│   └── deploy.yml               ← CI/CD automático
├── docker-compose.yml
├── .env                         ← NUNCA commitar
├── .env.example                 ← template sem secrets
├── docs/
│   ├── infraestrutura-seguranca.md ← firewall, Nginx, SSL, Docker, DNS
│   └── bibelo-dns-import.txt       ← registros DNS para Cloudflare
└── CLAUDE.md                    ← este arquivo
```

---

## Banco de dados — schemas e tabelas

### schema: crm
- `customers` — clientes unificados (físico + online + Instagram)
- `customer_scores` — LTV, ticket médio, score 0-100, risco de churn
- `interactions` — histórico de contatos e interações
- `deals` — pipeline de negociações
- `segments` — segmentos dinâmicos de clientes

### schema: marketing
- `templates` — templates de e-mail e WhatsApp
- `campaigns` — campanhas com métricas (abertura, clique, conversão)
- `campaign_sends` — registro individual de cada envio
- `flows` — fluxos automáticos com steps em JSON
- `flow_executions` — execução por cliente

### schema: sync
- `bling_orders` — pedidos vindos do Bling
- `bling_customers` — contatos vindos do Bling
- `nuvemshop_orders` — pedidos via webhook NuvemShop
- `sync_logs` — log de todas as sincronizações
- `sync_state` — controle de última sync por fonte

### schema: public
- `users` — usuários do CRM (admin, editor, viewer)
- `sessions` — refresh tokens JWT
- `migrations` — controle de migrations aplicadas

---

## Variáveis de ambiente obrigatórias

Ficam em `/opt/bibelocrm/.env` — nunca commitar.
Consultar `.env.example` para ver todos os campos.

Principais:
```
DATABASE_URL      postgresql://bibelocrm:SENHA@postgres:5432/bibelocrm
REDIS_URL         redis://:SENHA@redis:6379
JWT_SECRET        mínimo 32 chars
BLING_CLIENT_ID   + BLING_CLIENT_SECRET
NUVEMSHOP_WEBHOOK_SECRET
RESEND_API_KEY
EVOLUTION_API_KEY
GOOGLE_CLIENT_ID    + GOOGLE_CLIENT_SECRET
```

---

## Rotas da API

### Públicas (sem auth)
- `GET  /health` — status da API e banco
- `POST /api/auth/google` — recebe credential Google, retorna accessToken + refreshToken

### Protegidas (Bearer JWT obrigatório)
- `GET  /api/auth/me`
- `POST /api/auth/logout`
- `GET  /api/customers` — lista paginada com filtros
- `GET  /api/customers/:id` — perfil completo + score
- `POST /api/customers` — criar/atualizar (upsert por email)
- `PUT  /api/customers/:id` — atualizar dados
- `GET  /api/customers/:id/timeline` — histórico de interações
- `GET  /api/analytics/overview` — KPIs gerais
- `GET  /api/analytics/revenue` — receita por mês
- `GET  /api/analytics/segments` — clientes por segmento
- `GET  /api/campaigns` — listar campanhas
- `POST /api/campaigns` — criar campanha
- `POST /api/campaigns/:id/send` — disparar campanha
- `GET  /api/sync/status` — status das sincronizações
- `POST /api/sync/bling` — sync manual do Bling
- `POST /api/auth/bling` — inicia OAuth2 Bling

### Webhooks (validação HMAC)
- `POST /api/webhooks/nuvemshop` — recebe eventos da NuvemShop

---

## Regras de desenvolvimento

### Sempre
- Validar inputs com **Zod** em todas as rotas
- Usar helpers `query()` e `queryOne()` de `src/db/index.ts`
- Logar operações críticas com `logger.info()` e `logger.error()`
- Proteger rotas com `authMiddleware` (exceto /health e /api/auth/login)
- Nunca expor stack trace para o cliente — só mensagem genérica
- Nunca hardcodar secrets — sempre `process.env.NOME`
- Parâmetros SQL sempre via `$1, $2` — nunca concatenação

### Nunca
- Commitar o arquivo `.env`
- Usar `console.log` em produção — sempre `logger`
- Expor detalhes do banco em respostas de erro
- Deixar rotas sem tratamento de erro

---

## Comandos do dia a dia
```bash
# Ver status dos containers
docker compose ps

# Logs em tempo real
docker compose logs -f api
docker compose logs -f frontend

# Rebuild após mudanças
docker compose up -d --build api
docker compose up -d --build frontend

# Testar API
curl -s http://localhost:4000/health | python3 -m json.tool

# Acessar banco
docker compose exec postgres psql -U bibelocrm bibelocrm

# Backup manual
bash scripts/backup.sh

# Ver logs de erro da API
docker compose exec api cat logs/error.log
```

---

## Fluxo de deploy
```
git push origin main
    ↓
GitHub Actions (build + testes)
    ↓
rsync para /opt/bibelocrm no VPS
    ↓
docker compose up -d --build
    ↓
health check /api/health
    ↓
notificação WhatsApp (sucesso ou falha)
```

---

## Integrações externas

### Bling ERP v3
- OAuth2 — tokens salvos em `sync.sync_state`
- Sync incremental a cada 30min via BullMQ
- Rate limit: 60 req/min — usar delay automático
- Dados: contatos, pedidos, financeiro

### NuvemShop
- Webhooks com validação HMAC SHA256
- Eventos: orders/created, orders/paid, orders/cancelled, customers/created
- Endpoint: POST /api/webhooks/nuvemshop

### Resend (e-mail)
- SDK oficial — `import { Resend } from 'resend'`
- Plano grátis: 3.000 e-mails/mês
- Rastreio de abertura via pixel, clique via redirect

### Evolution API (WhatsApp)
- Self-hosted no container `bibelo_whatsapp`
- URL interna: http://evolution:8080
- Instância: bibelocrm

---

## Ecossistema Bibelô completo
```
papelariabibelo.com.br          NuvemShop (loja online)
                                    ↓ webhooks
                                BibelôCRM ← este projeto
                                    ↑ sync
Bling ERP (PDV físico + NF-e) ──────┘
                                    ↓
                            E-mail + WhatsApp
                            (Resend + Evolution)
```

---

## Backlog priorizado

### P0 — Próximos (sem isso o CRM não funciona)
1. ~~**Frontend: Login + Layout**~~ ✅ — Google Sign-In, AuthContext, sidebar responsiva, proteção de rotas
2. ~~**Frontend: Dashboard**~~ ✅ — KPIs reais, gráfico receita mensal, gráfico segmentos (Recharts)
3. ~~**Frontend: Lista de Clientes**~~ ✅ — Tabela paginada, busca, filtro segmento, link perfil
4. ~~**Frontend: Perfil do Cliente**~~ ✅ — Dados, score, timeline interações/pedidos
5. **Rotas de Campanhas** — `api/src/routes/campaigns.ts` — CRUD + disparo (tabelas marketing.* existem)
6. **Rotas de Sync** — `api/src/routes/sync.ts` — GET status, POST sync manual Bling, POST OAuth redirect

### P1 — Integrações reais (dependem de credenciais)
7. **Resend email** — `api/src/integrations/resend/` — envio com templates, tracking abertura/clique
8. **Evolution WhatsApp** — `api/src/integrations/whatsapp/` — envio via Evolution API interna
9. **Motor de Fluxos** — `api/src/services/flow.service.ts` — executor flows automáticos
10. **Bling OAuth redirect** — rota callback real que salva tokens

### P2 — Frontend completo
11. **Frontend: Campanhas** — criar, agendar, disparar, ver métricas
12. **Frontend: Segmentos** — visualizar segmentos + totais
13. **Frontend: Sync/Integrações** — painel status Bling/NuvemShop, sync manual, logs
14. **Frontend: Pipeline (Deals)** — kanban negociações (crm.deals)

### P3 — Robustez e operação
15. **Testes** — zero testes hoje, pelo menos integração nas rotas principais
16. **Uptime Kuma** — container existe mas não configurado
17. **Backup R2** — vars R2 no .env.example mas backup.sh não faz upload
18. **Notificação de deploy** — GitHub Actions → WhatsApp via Evolution

---

## Histórico de commits

- 88a8c59 estrutura inicial + docker-compose + CI/CD
- 2c85f7d setup.sh completo do VPS
- e1b5125 migration 001 — 17 tabelas — 355 linhas
- fe02a9e API base — server, auth, health, db, logger
- b689892 Frontend React — Vite + splash screen
- 00aed94 fix package-lock + Dockerfile npm install
- 56c5e3b fix healthcheck API + compose frontend
- e72f147 package-lock frontend + Dockerfile server.js
- 5f352ce fix: copia server.js no Dockerfile do frontend
- e605b5b feat: customers, analytics, Bling sync, NuvemShop webhooks, BullMQ queues
- a049d41 docs: documenta infraestrutura completa — firewall, Nginx, SSL, Docker, DNS
- c4f5d83 feat: frontend login Google OAuth, layout sidebar, rotas protegidas
- cf61c7a feat: dashboard com KPIs reais, gráfico receita mensal e segmentos


## Protocolo de atualização deste arquivo

Ao concluir qualquer tarefa que modifique o projeto, o agente DEVE atualizar o CLAUDE.md automaticamente:

### O que atualizar após cada sessão:

1. **Histórico de commits** — adicionar os novos commits com hash e descrição
2. **Rotas da API** — adicionar novas rotas criadas
3. **Estrutura de diretórios** — adicionar novos arquivos e pastas relevantes
4. **Integrações** — atualizar status (pendente / em desenvolvimento / concluído)
5. **Data de última atualização** — sempre atualizar no rodapé

### Status das integrações (manter sempre atualizado):

| Integração | Status | Observações |
|-----------|--------|-------------|
| PostgreSQL | ✅ produção | 17 tabelas, 3 schemas |
| Redis | ✅ produção | cache + filas BullMQ |
| Nginx + SSL | ✅ produção | crm.papelariabibelo.com.br |
| API Node.js | ✅ produção | /health respondendo |
| Google OAuth2 | ✅ produção | login exclusivo via Google Sign-In |
| Frontend React | 🔧 dashboard + clientes | login, dashboard KPIs, lista/perfil clientes |
| GitHub Actions | ✅ configurado | deploy automático no push |
| Bling OAuth2 | 🔧 código pronto | aguardando credenciais reais |
| Bling Sync | 🔧 código pronto | aguardando OAuth2 funcional |
| NuvemShop Webhooks | 🔧 código pronto | aguardando configuração no painel NS |
| Resend E-mail | ⏳ pendente | aguardando API key |
| Evolution WhatsApp | ⏳ pendente | aguardando configuração |
| Uptime Kuma | ⏳ pendente | container não subiu ainda |

### Regra obrigatória:

Toda sessão deve terminar com:
1. `git add CLAUDE.md`
2. Commit junto com as mudanças da sessão
3. Nunca deixar o CLAUDE.md desatualizado por mais de 1 commit

Após adicionar essa seção, faça commit:
git add CLAUDE.md
git commit -m "docs: adiciona protocolo de atualização automática do CLAUDE.md"
git push origin main

---

*BibelôCRM — Ecossistema Bibelô 🎀*
*Última atualização: 27 de Março de 2026*