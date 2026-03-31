# CLAUDE.md — BibelôCRM

Guia para o agente Claude Code operar o projeto BibelôCRM.

---

## Identidade do projeto

**BibelôCRM** é o CRM + Hub de Marketing da Papelaria Bibelô.
Localização: **Timbó/SC** — loja física + online.
Faz parte do **Ecossistema Bibelô** — integrado com Bling ERP e NuvemShop.
Dono: Carlos Eduardo — carloseduardocostatj@gmail.com
Repositório: https://github.com/carloseduardomcosta/bibelo_ecossistema

---

## Stack técnica

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 20 + TypeScript + Express |
| Banco | PostgreSQL 16 (schemas: crm, marketing, sync, financeiro, public) |
| Cache / Filas | Redis 7 + BullMQ |
| Frontend | React 18 + Vite + TypeScript |
| Containers | Docker + Docker Compose |
| Proxy | Nginx + SSL Let's Encrypt |
| E-mail | Resend SDK |
| WhatsApp | Meta Cloud API + Chatwoot (planejado) |
| Atendimento | Chatwoot self-hosted (planejado) |
| Deploy | GitHub Actions → rsync → VPS Hostinger |

---

## Estrutura de diretórios (resumo)

```
/opt/bibelocrm/
├── api/src/
│   ├── server.ts               ← entrada principal
│   ├── routes/                  ← 18 arquivos de rotas (ver docs/api-routes.md)
│   ├── services/                ← customer.service.ts, flow.service.ts
│   ├── integrations/            ← bling/, nuvemshop/, resend/, google/, whatsapp/
│   ├── queues/                  ← sync.queue.ts, flow.queue.ts (BullMQ)
│   ├── middleware/auth.ts       ← JWT authMiddleware + requireAdmin
│   ├── db/                      ← Pool + query helpers + migrate
│   └── utils/                   ← logger (Winston), geoip (MaxMind)
├── frontend/src/
│   ├── pages/                   ← 20 páginas React
│   ├── components/              ← Layout, ProtectedRoute, Toast, GlobalSearch
│   ├── hooks/                   ← useCustomers, useCampaigns etc
│   └── lib/                     ← api.ts (Axios), auth.tsx, format.ts, export.ts
├── db/migrations/               ← SQL em ordem numérica
├── scripts/                     ← setup.sh, backup.sh, test.sh
├── docs/                        ← API routes, infra, Bling/NuvemShop docs, commits
├── docker-compose.yml
├── .env                         ← NUNCA commitar
└── CLAUDE.md                    ← este arquivo
```

---

## Banco de dados — schemas e tabelas

### crm
`customers`, `customer_scores`, `interactions`, `deals`, `segments`, `tracking_events`, `visitor_customers`

### marketing
`templates`, `campaigns`, `campaign_sends`, `flows`, `flow_executions`, `flow_step_executions`, `pedidos_pendentes`, `leads`, `popup_config`

### sync
`bling_orders`, `bling_customers`, `nuvemshop_orders`, `sync_logs`, `sync_state`

### financeiro
`categorias`, `lancamentos`, `despesas_fixas`, `despesas_fixas_pagamentos`, `custos_embalagem`, `kits_embalagem`, `kit_itens`, `canais_venda`, `notas_entrada`, `notas_entrada_itens`

### public
`users`, `sessions`, `migrations`

---

## Variáveis de ambiente

Ficam em `/opt/bibelocrm/.env` — nunca commitar. Ver `.env.example` para todos os campos.

---

## Rotas da API

Referência completa em **`docs/api-routes.md`** (~120 endpoints).

Resumo: auth (Google OAuth), customers CRUD + timeline, analytics, campaigns + templates, sync (Bling/NuvemShop), products, financeiro (20+ endpoints), NF entrada, orders, search, tracking, leads, flows, links, briefing diário, webhooks.

Endpoints públicos (sem auth): `/health`, auth/google, tracking (event/identify/bibelo.js), leads (capture/confirm/popup.js/config/view), email/unsubscribe, links, webhooks.

---

## Idioma

Toda comunicação **DEVE ser em português brasileiro (pt-BR)**. Commits, mensagens de erro, labels, placeholders, comentários.

---

## Concorrência entre Agents

### Regras obrigatórias:
1. Antes de `docker compose build/up`, verificar se outro agent está fazendo o mesmo
2. Antes de editar um arquivo, verificar se foi modificado recentemente por outro agent
3. Nunca sobrescrever mudanças de outro agent — integrar
4. Se houver conflito de build, apenas corrija o erro mínimo sem alterar lógica do outro

### Protocolo STOP:
- Se o dono pedir **STOP**, parar imediatamente. Só retomar quando autorizado.
- Ao retomar, fazer `git pull` e verificar mudanças.

---

## Regras de desenvolvimento

### Sempre
- Validar inputs com **Zod** em todas as rotas
- Usar helpers `query()` e `queryOne()` de `src/db/index.ts`
- Logar com `logger.info()` e `logger.error()` (nunca `console.log`)
- Proteger rotas com `authMiddleware` (exceto /health e /api/auth/login)
- Parâmetros SQL sempre via `$1, $2` — nunca concatenação
- Nunca hardcodar secrets — sempre `process.env.NOME`
- Nunca expor stack trace ou detalhes do banco para o cliente

### Protocolo de segurança (validar após cada implementação)
1. **SQL Injection** — queries com `$1, $2`. Intervalos: `make_interval(days => $1)`
2. **XSS** — sanitizar com `esc()` toda variável em HTML/emails/scripts
3. **Rate Limiting** — endpoint público → `publicLimiter`
4. **HMAC** — `timingSafeEqual` + verificação de tamanho + prefixo de domínio
5. **Logs** — nunca logar secrets, JWT, senhas
6. **Inputs** — validar com Zod
7. **Dados em HTML** — escapar nomes, emails, produtos do banco

### Regras de negócio (emails e fluxos)
- triggerFlow nunca re-executa (ignora se já existe execução)
- Reativação só para quem tem pelo menos 1 pedido
- Testes de email: SEMPRE em `carloseduardocostatj@gmail.com`
- Captura de lead vincula visitor_id ao customer
- Cada email de fluxo registra interação em `crm.interactions`
- Cupom só para novos clientes (sem pedidos Bling + NuvemShop)
- Cupom só após verificação de email (HMAC link)
- Opt-out LGPD respeitado em campanhas e fluxos
- Descadastro notifica o admin por email
- IP real via `X-Forwarded-For` (proxy Docker 172.21.x)
- Busca de email sempre `LOWER(email) = LOWER($1)`

---

## Testes automatizados

**Vitest 1.6 + Supertest** — testes de integração contra banco real.

```bash
bash scripts/test.sh                          # todos
bash scripts/test.sh src/routes/leads.test.ts  # específico
```

30 testes: health (1), email (6), leads (14), orders (9).

Regras: endpoint público → testes de input, token, XSS. Protegido → 401 + resposta válida. Limpar dados no `afterAll`. Sem mocks de DB.

---

## Comandos do dia a dia
```bash
docker compose ps                    # status containers
docker compose logs -f api           # logs API
docker compose up -d --build api     # rebuild API
docker compose up -d --build frontend # rebuild frontend
curl -s http://localhost:4000/health | python3 -m json.tool
docker compose exec postgres psql -U bibelocrm bibelocrm
bash scripts/backup.sh
```

---

## Fluxo de deploy
```
git push origin main → GitHub Actions → rsync VPS → docker compose up -d --build → health check
```

---

## Integrações externas

### Bling ERP v3
- Docs: `docs/bling-api-openapi.json` + `docs/bling-api-referencia.md`
- OAuth2 tokens em `sync.sync_state`. Sync incremental 30min via BullMQ.
- **Rate limit: 3 req/s** — delay 350ms, retry em 429
- Lista de produtos NÃO traz categoria. Lista de pedidos NÃO traz itens. Estoques EXIGE `idsProdutos[]` (lotes de 50).
- Webhook HMAC: `X-Bling-Signature-256: sha256=<hash>` com client_secret

### NuvemShop
- OAuth2: token nunca expira — app_id `26424`, store `7290881`
- Header: `Authentication: bearer` (NÃO `Authorization`)
- **Rate limit: 2 req/s** (burst 40, leaky bucket)
- 9 webhooks em `webhook.papelariabibelo.com.br`
- HMAC: `x-linkedstore-hmac-sha256` com `client_secret`

### Resend (e-mail)
- Plano grátis: 3.000/mês. Remetente: `Papelaria Bibelô <marketing@papelariabibelo.com.br>`
- 14 templates no banco

### Chatwoot + Meta Cloud API (WhatsApp + Instagram) — planejado
- Plano completo: `docs/whatsapp-oficial-chatwoot.md`
- Chatwoot self-hosted em chat.papelariabibelo.com.br
- WhatsApp via Meta Cloud API oficial (sem risco de ban)
- Instagram DM via Instagram Messaging API
- BibelôCRM envia templates via Chatwoot REST API
- Custo estimado: ~R$ 105/mês (mensagens Meta)

---

## Documentação complementar

| Arquivo | Conteúdo |
|---------|----------|
| `docs/api-routes.md` | Referência completa de todos os endpoints (~120 rotas) |
| `docs/commits-history.md` | Histórico de commits do projeto |
| `docs/integrations-status.md` | Tabela de status de todas as integrações |
| `docs/roadmap-fases.md` | Roadmap por fases do projeto |
| `docs/infraestrutura-seguranca.md` | Firewall, Nginx, SSL, Docker, DNS |
| `docs/bling-api-referencia.md` | Resumo da API Bling v3 |
| `docs/bling-api-openapi.json` | OpenAPI 3.0 spec completo (1MB) |
| `docs/nuvemshop-api-erp-guide.md` | Guia completo NuvemShop API |
| `docs/whatsapp-estrategia.md` | Estratégia WhatsApp Business |
| `docs/whatsapp-oficial-chatwoot.md` | Plano completo: Chatwoot + Meta Cloud API + Instagram |
| `docs/ecommerce-proprio.md` | Arquitetura e-commerce próprio: Next.js + Medusa.js + Mercado Pago + Melhor Envio |
| `docs/pentest-report.md` | Relatório do pentest de segurança |

---

## Protocolo de atualização deste arquivo

Ao concluir tarefas que modifiquem o projeto, atualizar:
1. Novos commits → `docs/commits-history.md`
2. Novas rotas → `docs/api-routes.md`
3. Mudanças de integração → `docs/integrations-status.md`
4. Estrutura de diretórios — se novos arquivos/pastas relevantes
5. Data de última atualização no rodapé

Toda sessão deve terminar com `git add CLAUDE.md` junto com as mudanças.

---

## Code Review Completo (comando: /review)

### Escopo
Todos os arquivos fonte, config, scripts e infra.

### Áreas
1. **Código duplicado e morto** — consolidar abstrações
2. **Lógica e arquitetura** — N+1, índices, design patterns
3. **Segurança** — SQL injection, XSS, auth, secrets, CVEs
4. **Error handling** — promises, race conditions, edge cases
5. **Qualidade** — naming, SRP, consistência
6. **Performance** — re-renders, caching, tree-shaking

### Formato
Para cada issue: **arquivo:linha**, **severidade** (Critical/High/Medium/Low), **descrição** e **fix concreto**.

---

*BibelôCRM — Ecossistema Bibelô*
*Última atualização: 31 de Março de 2026 (briefing portal + email diário 7h)*
