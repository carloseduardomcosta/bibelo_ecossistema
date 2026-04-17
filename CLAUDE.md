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
| E-mail | Amazon SES v2 (primário, sa-east-1) + Resend SDK (fallback) — dual provider via EMAIL_PROVIDER |
| WhatsApp | Meta Cloud API + Chatwoot (planejado) |
| E-commerce | Medusa.js v2 (porta 9000) + Next.js storefront |
| Monitoramento | Uptime Kuma em status.papelariabibelo.com.br |
| Deploy | GitHub Actions → rsync → VPS Hostinger |

---

## Estrutura de diretórios (resumo)

```
/opt/bibelocrm/
├── api/src/
│   ├── server.ts               ← entrada principal
│   ├── routes/                  ← 18 arquivos de rotas (ver docs/api/rotas.md)
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
├── medusa/                      ← Medusa.js v2 (e-commerce, porta 9000)
├── storefront-v2/               ← Next.js storefront (porta 8001)
├── db/migrations/               ← SQL em ordem numérica
├── scripts/                     ← setup.sh, backup.sh, test.sh
├── docs/
│   ├── api/                     ← rotas da API
│   ├── claude/                  ← referências detalhadas para o agente
│   ├── integracoes/             ← Bling, NuvemShop, WhatsApp, status
│   ├── infra/                   ← segurança, pentest, DNS
│   ├── ecommerce/               ← Medusa, storefront, imagens
│   ├── projeto/                 ← roadmap, commits, auditoria
│   └── financeiro/              ← planilhas importadas
├── docker-compose.yml
├── .env                         ← NUNCA commitar
└── CLAUDE.md                    ← este arquivo
```

Schemas e tabelas completos: @docs/claude/banco-schemas.md

---

## Variáveis de ambiente

Ficam em `/opt/bibelocrm/.env` — nunca commitar. Ver `.env.example` para todos os campos.

---

## Rotas da API

Referência completa em **`docs/api/rotas.md`** (~120 endpoints).

Resumo: auth (Google OAuth), customers CRUD + timeline + reativar-email, analytics, campaigns + templates + personalizada (wizard) + email-events, sync (Bling/NuvemShop), products, financeiro (20+ endpoints), NF entrada, orders, search, tracking, leads, flows (condicionais com branching), links, briefing diário, webhooks, images (editor + envio Bling).

Endpoints públicos (sem auth): `/health`, auth/google, tracking (event/identify/bibelo.js), leads (capture/confirm/popup.js/config/view), email/unsubscribe, links, webhooks, images/serve/:id.

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

### Proteção de dados Bling — CRÍTICO (NUNCA violar)
- **NUNCA** alterar estrutura de **estoque** no Bling (quantidades, depósitos, saldos)
- **NUNCA** alterar estrutura de **preços** no Bling (preço de custo, venda, atacado, tabelas de preço)
- **Editor de imagens / Conversor**: antes de qualquer operação que envie ou modifique imagens no Bling via API, **AVALIAR IMPACTOS e PERGUNTAR ao dono** antes de executar
- **Motivo**: incidente em 05/04/2026 onde uma operação afetou números, estoque e imagens de produtos no Bling — impacto grave no ERP
- Qualquer PATCH no endpoint `/produtos/{id}` do Bling que inclua campos de estoque, preço ou imagens deve ser **explicitamente autorizado** pelo dono
- Em caso de dúvida, **NÃO executar** — perguntar primeiro

### Protocolo de testes com clientes reais — OBRIGATÓRIO
- **NUNCA** executar testes, disparos de email, envios de SMS/WhatsApp, ou qualquer ação que impacte clientes reais sem autorização **EXPLÍCITA** do dono (Carlos Eduardo)
- Antes de qualquer ação que toque clientes reais, **PERGUNTAR em pt-BR**: "Deseja que eu execute isso com clientes reais? Os impactos serão: [lista de impactos]"
- Testes de email: usar `contato@papelariabibelo.com.br` — nunca email de cliente
- Testes de fluxo: criar customer de teste, nunca usar customer real
- Testes de cupom: gerar cupom de teste com prefixo `TEST-` — nunca ativar cupom real

---

## Testes automatizados

**Vitest 1.6 + Supertest** — testes de integração contra banco real.

```bash
bash scripts/test.sh                          # todos
bash scripts/test.sh src/routes/leads.test.ts  # específico
```

615 testes (484 CRM + 131 storefront). Regras: endpoint público → testes de input, token, XSS. Protegido → 401 + resposta válida. Limpar dados no `afterAll`. Sem mocks de DB.

---

## Comandos do dia a dia
```bash
# RTK instalado — prefixar com "rtk" nos comandos pesados para economia de tokens
rtk docker compose ps                              # status containers
rtk docker compose logs -f api                     # logs API
rtk docker compose up -d --build api               # rebuild API
rtk docker compose up -d --build frontend          # rebuild frontend
rtk curl -s http://localhost:4000/health           # health check
rtk docker compose exec postgres psql -U bibelocrm bibelocrm  # psql
bash scripts/backup.sh                             # backup (usa rtk vitest internamente)
rtk ufw status                                     # firewall
```

---

## Fluxo de deploy
```
git push origin main → GitHub Actions → rsync VPS → docker compose up -d --build → health check
```

---

## Protocolo de atualização deste arquivo

Ao concluir tarefas que modifiquem o projeto, atualizar:
1. Novos commits → `docs/projeto/commits.md`
2. Novas rotas → `docs/api/rotas.md`
3. Mudanças de integração → `docs/integracoes/status.md`
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

## Referências detalhadas

@docs/claude/banco-schemas.md
@docs/claude/email-fluxos.md
@docs/claude/landing-pages.md
@docs/claude/backup-dr.md
@docs/claude/editor-imagens.md
@docs/claude/sync-bling-medusa.md
@docs/claude/storefront.md
@docs/claude/integracoes.md
@docs/claude/medusa-operacional.md
@docs/claude/fornecedor-catalogo.md
@docs/claude/documentacao-complementar.md

---

## Skills ativas

@.claude/skills/bibelo-design.md
@.claude/skills/bibelo-storefront.md
@.claude/skills/security-review.md
@.claude/skills/verification-loop.md
@.claude/skills/briefing/SKILL.md

---

*BibelôCRM — Ecossistema Bibelô*
*Última atualização: 17 de Abril de 2026 — página Curadoria no CRM, store-settings integrado no storefront (BenefitsStrip + checkout), desconto Pix 3% via CRM, parcelamento com juros MP*
