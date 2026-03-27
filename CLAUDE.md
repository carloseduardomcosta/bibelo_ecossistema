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
│   │   │   ├── auth.ts          ← POST /google, GET /me, POST /logout
│   │   │   ├── customers.ts     ← CRUD + timeline (5 endpoints)
│   │   │   ├── analytics.ts     ← overview, revenue, segments
│   │   │   ├── campaigns.ts     ← CRUD + disparo (5 endpoints)
│   │   │   ├── templates.ts     ← CRUD + soft delete (5 endpoints)
│   │   │   ├── sync.ts          ← status, sync manual, OAuth Bling
│   │   │   ├── products.ts     ← CRUD produtos, estoque, lucratividade
│   │   │   └── financeiro.ts   ← módulo financeiro completo (20+ endpoints)
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
│   │   │   ├── ClientePerfil.tsx ← perfil completo + score + timeline
│   │   │   ├── Produtos.tsx     ← lista produtos + custo/venda/margem/estoque
│   │   │   ├── Estoque.tsx      ← KPIs estoque, gráfico por categoria
│   │   │   ├── Lucratividade.tsx ← KPIs lucro, top produtos, receita/categoria
│   │   │   ├── Segmentos.tsx    ← cards segmentos + lista clientes por segmento
│   │   │   ├── Campanhas.tsx    ← lista + criar campanhas email/whatsapp
│   │   │   ├── Financeiro.tsx   ← dashboard financeiro + lançamentos
│   │   │   ├── DespesasFixas.tsx ← controle vencimentos + pagamentos mensais
│   │   │   ├── SimuladorCustos.tsx ← simulador marketplace + kits embalagem
│   │   │   └── Sync.tsx         ← painel Bling/NuvemShop + logs
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
│   ├── bling-api-openapi.json      ← OpenAPI 3.0 spec completo (1MB, 160 endpoints)
│   ├── bling-api-referencia.md     ← resumo endpoints, auth, webhooks, rate limits
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

### schema: financeiro
- `categorias` — categorias de receita e despesa (23 padrão)
- `lancamentos` — receitas e despesas com data, valor, status, categoria
- `despesas_fixas` — despesas recorrentes com dia de vencimento
- `despesas_fixas_pagamentos` — controle pago/pendente por mês
- `custos_embalagem` — itens de embalagem com custo unitário
- `kits_embalagem` — kits pré-configurados (Pequeno, Médio, Grande)
- `kit_itens` — itens de cada kit com quantidade
- `canais_venda` — taxas por marketplace (NuvemShop, ML, Shopee, etc.)

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
- `GET  /api/campaigns` — listar campanhas (paginada, filtro status/canal)
- `GET  /api/campaigns/:id` — detalhes + sends por status
- `POST /api/campaigns` — criar campanha
- `PUT  /api/campaigns/:id` — atualizar campanha
- `POST /api/campaigns/:id/send` — disparar campanha (cria sends, muda status)
- `GET  /api/templates` — listar templates (filtro por canal)
- `GET  /api/templates/:id` — detalhes do template
- `POST /api/templates` — criar template
- `PUT  /api/templates/:id` — atualizar template
- `DELETE /api/templates/:id` — soft delete
- `GET  /api/sync/status` — status integrações + logs recentes
- `POST /api/sync/bling` — sync manual (?tipo=full|incremental)
- `GET  /api/auth/bling` — retorna URL de autorização OAuth Bling
- `GET  /api/auth/bling/callback` — callback OAuth, salva tokens, redireciona frontend
- `GET  /api/products` — lista paginada (busca, categoria, ativo)
- `GET  /api/products/categories` — categorias distintas
- `GET  /api/products/stock-overview` — resumo estoque + por categoria
- `GET  /api/products/analytics/profitability` — receita vs custo, top produtos, por categoria
- `GET  /api/products/:id` — detalhe + estoque por depósito + vendas

### Financeiro (Bearer JWT obrigatório)
- `GET  /api/financeiro/dashboard` — KPIs, resumo mensal, categorias (param: periodo)
- `GET  /api/financeiro/lancamentos` — lista paginada (filtros: tipo, status, categoria_id, mes, search)
- `GET  /api/financeiro/lancamentos/:id` — detalhe
- `POST /api/financeiro/lancamentos` — criar lançamento
- `PUT  /api/financeiro/lancamentos/:id` — atualizar
- `DELETE /api/financeiro/lancamentos/:id` — cancelar (soft delete)
- `GET  /api/financeiro/categorias` — listar categorias com total de lançamentos
- `POST /api/financeiro/categorias` — criar categoria
- `GET  /api/financeiro/despesas-fixas` — listar despesas fixas ativas
- `POST /api/financeiro/despesas-fixas` — criar despesa fixa
- `PUT  /api/financeiro/despesas-fixas/:id` — atualizar
- `GET  /api/financeiro/despesas-fixas/alertas` — status do mês (atrasado, vence_em_breve, pago, pendente)
- `GET  /api/financeiro/despesas-fixas/pagamentos` — pagamentos por mês
- `POST /api/financeiro/despesas-fixas/:id/pagar` — marcar como pago
- `POST /api/financeiro/despesas-fixas/:id/desfazer-pagamento` — desfazer pagamento
- `GET  /api/financeiro/embalagens` — itens + kits com custo total
- `PUT  /api/financeiro/embalagens/:id` — atualizar custo
- `GET  /api/financeiro/canais` — canais de venda com taxas
- `PUT  /api/financeiro/canais/:id` — atualizar taxas
- `POST /api/financeiro/simular` — simulador de custos por marketplace

### Webhooks (validação HMAC)
- `POST /api/webhooks/nuvemshop` — recebe eventos da NuvemShop

---

## Idioma

Toda comunicação com o dono do projeto (Carlos) **DEVE ser em português brasileiro (pt-BR)**. Isso inclui: perguntas, explicações, commits, mensagens de erro no frontend, nomes de variáveis no frontend (labels, placeholders), e comentários no código.

---

## Concorrência entre Agents

Este projeto pode ter **múltiplos agents Claude trabalhando simultaneamente**.

### Regras obrigatórias:
1. **Antes de fazer `docker compose build` ou `docker compose up`**, verificar se outro agent está fazendo o mesmo — conflitos de container travam o deploy
2. **Antes de editar um arquivo**, verificar se ele foi modificado recentemente por outro agent (o sistema avisa via `<system-reminder>`)
3. **Nunca sobrescrever** mudanças de outro agent — integrar as mudanças
4. **Se houver conflito de build** (erros TS em arquivos que você não criou), apenas corrija o erro mínimo (unused imports etc) sem alterar a lógica do outro agent

### Protocolo STOP:
- Se o dono pedir **STOP**, o agent deve parar imediatamente
- Apenas **1 agent trabalha por vez** até concluir
- O agent parado **NÃO retoma sozinho** — só o dono pode autorizar com "pode retomar", "volta", "continua" etc.
- Ao retomar, o agent deve fazer `git pull` e verificar mudanças feitas pelo outro agent antes de continuar

### Como identificar outro agent:
- Arquivos novos que você não criou aparecendo no projeto
- `<system-reminder>` dizendo que um arquivo foi modificado
- Erros de TS em páginas que você não escreveu (ex: `Financeiro.tsx`)
- Conflitos de container no docker compose

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
- **Documentação completa**: `docs/bling-api-openapi.json` (OpenAPI 3.0 spec, 1MB) + `docs/bling-api-referencia.md` (resumo markdown)
- OAuth2 — tokens salvos em `sync.sync_state` (campo TEXT)
- Sync incremental a cada 30min via BullMQ (contatos, pedidos com itens, produtos com categorias, estoque)
- **Rate limit: 3 req/s** (não 60/min) — delay 350ms entre requests, retry em 429
- `/produtos` na lista NÃO traz categoria — usar `/produtos?idCategoria={id}` por categoria
- `/pedidos/vendas` na lista NÃO traz itens — buscar detalhe `/pedidos/vendas/{id}`
- `/estoques/saldos` EXIGE `idsProdutos[]` — enviar em lotes de 50
- Webhook HMAC: `X-Bling-Signature-256: sha256=<hash>` com client_secret
- Dados: contatos, pedidos (com itens), produtos, estoque, categorias, financeiro

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
5. ~~**Rotas de Campanhas**~~ ✅ — CRUD + disparo + templates (api/src/routes/campaigns.ts + templates.ts)
6. ~~**Rotas de Sync**~~ ✅ — GET status, POST sync manual, OAuth Bling callback

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
- 48cf9d3 feat: lista de clientes paginada + perfil completo com score e timeline
- 96fa2f8 feat: rotas CRUD campanhas + templates com disparo e soft delete
- 074e41c feat: rotas sync status, sync manual Bling e OAuth callback
- eddcf14 feat: página Sync com painel Bling/NuvemShop, botões sync e logs
- 6ed9dbe feat: módulo ERP — produtos, estoque e lucratividade com sync Bling
- 1df46c4 feat: dashboard CEO com insights, comparativos e alertas
- 7d99f36 feat: filtro de período no Dashboard (7d, 15d, 30d, 3m, 6m, 1a)
- 3d955a6 feat: estoque com alertas de reposição + página campanhas funcional
- 9c5e980 feat: página Segmentos + fix upsert clientes por bling_id


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
| PostgreSQL | ✅ produção | 25 tabelas, 4 schemas (crm, marketing, sync, financeiro) |
| Redis | ✅ produção | cache + filas BullMQ |
| Nginx + SSL | ✅ produção | crm.papelariabibelo.com.br |
| API Node.js | ✅ produção | /health respondendo |
| Google OAuth2 | ✅ produção | login exclusivo via Google Sign-In |
| Módulo Financeiro | ✅ produção | fluxo de caixa, despesas fixas, simulador, embalagens |
| Frontend React | 🔧 dashboard + clientes + financeiro | login, dashboard, clientes, financeiro, simulador |
| GitHub Actions | ✅ configurado | deploy automático no push |
| Bling OAuth2 | ✅ configurado | credenciais no .env, callback funcional |
| Bling Sync | ✅ código pronto | sync manual + incremental 30min via BullMQ |
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
*Última atualização: 27 de Março de 2026 — Módulo Financeiro*