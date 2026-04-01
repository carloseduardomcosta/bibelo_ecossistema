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
| E-commerce | Medusa.js v2 (porta 9000) + Next.js storefront |
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
├── storefront/                  ← Next.js storefront (porta 8001)
├── db/migrations/               ← SQL em ordem numérica
├── scripts/                     ← setup.sh, backup.sh, test.sh
├── docs/
│   ├── api/                     ← rotas da API
│   ├── integracoes/             ← Bling, NuvemShop, WhatsApp, status
│   ├── infra/                   ← segurança, pentest, DNS
│   ├── ecommerce/               ← Medusa, storefront, imagens
│   ├── projeto/                 ← roadmap, commits, auditoria
│   └── financeiro/              ← planilhas importadas
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

Referência completa em **`docs/api/rotas.md`** (~120 endpoints).

Resumo: auth (Google OAuth), customers CRUD + timeline + reativar-email, analytics, campaigns + templates + personalizada (wizard), sync (Bling/NuvemShop), products, financeiro (20+ endpoints), NF entrada, orders, search, tracking, leads, flows, links, briefing diário, webhooks.

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
- Docs: `docs/integracoes/bling-openapi.json` + `docs/integracoes/bling-referencia.md`
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
- Plano completo: `docs/integracoes/whatsapp-chatwoot.md`
- Chatwoot self-hosted em chat.papelariabibelo.com.br
- WhatsApp via Meta Cloud API oficial (sem risco de ban)
- Instagram DM via Instagram Messaging API
- BibelôCRM envia templates via Chatwoot REST API
- Custo estimado: ~R$ 105/mês (mensagens Meta)

---

## Documentação complementar

### `docs/api/`
| Arquivo | Conteúdo |
|---------|----------|
| `rotas.md` | Referência completa de todos os endpoints (~120 rotas) |

### `docs/integracoes/`
| Arquivo | Conteúdo |
|---------|----------|
| `status.md` | Tabela de status de todas as integrações |
| `visao-geral.md` | Visão geral das integrações do ecossistema |
| `bling-referencia.md` | Resumo da API Bling v3 |
| `bling-openapi.json` | OpenAPI 3.0 spec completo (1MB) |
| `nuvemshop-guia.md` | Guia completo NuvemShop API |
| `nuvemshop-setup.md` | Passo a passo para criar app NuvemShop |
| `whatsapp-estrategia.md` | Estratégia WhatsApp Business |
| `whatsapp-chatwoot.md` | Plano completo: Chatwoot + Meta Cloud API + Instagram |

### `docs/ecommerce/`
| Arquivo | Conteúdo |
|---------|----------|
| `arquitetura.md` | Arquitetura e-commerce: Next.js + Medusa.js + Mercado Pago + Melhor Envio |
| `padrao-imagens.md` | Padrão de imagens para produtos |

### `docs/infra/`
| Arquivo | Conteúdo |
|---------|----------|
| `seguranca.md` | Firewall, Nginx, SSL, Docker, DNS |
| `pentest.md` | Relatório do pentest de segurança |
| `dns-import.txt` | Registros DNS importados do Cloudflare |

### `docs/projeto/`
| Arquivo | Conteúdo |
|---------|----------|
| `roadmap.md` | Roadmap por fases do projeto |
| `commits.md` | Histórico de commits do projeto |
| `auditoria.md` | Auditoria de gaps e melhorias |

### `docs/financeiro/`
| Arquivo | Conteúdo |
|---------|----------|
| `importsmacedo/` | Planilhas importadas (custos, fluxo de caixa) |

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

*BibelôCRM — Ecossistema Bibelô*
*Última atualização: 1 de Abril de 2026 — api.papelariabibelo.com.br ativo (DNS + SSL + Nginx), docs reorganizados em subpastas, Medusa.js v2 integrado*

---

## Skills ativas

@/mnt/skills/organization/secure-dev/SKILL.md
@/mnt/skills/public/frontend-design/SKILL.md
@/mnt/skills/public/docx/SKILL.md
@/mnt/skills/public/pptx/SKILL.md
@.claude/skills/bibelo-design.md
---

## Medusa.js v2 — Guia operacional completo

### Contexto
- Versão: @medusajs/medusa 2.13.5 + @medusajs/utils 2.13.5
- Container: bibelo_medusa → porta interna 9000
- Acesso externo: https://api.papelariabibelo.com.br → Nginx → localhost:9000
- Admin: DESABILITADO (admin: { disable: true }) — bug ADMIN_RELATIVE_OUTPUT_DIR undefined na versão atual
- Demora ~90s para ficar healthy após subir

### Estrutura de arquivos no container de produção
O Dockerfile copia apenas:
- .medusa/         → build output do framework
- node_modules/    → dependências (1228 pacotes, NÃO ignorar no .dockerignore)
- package.json
- medusa-config.ts
- tsconfig.json
- dist/            → módulos customizados compilados (src/ compilado)

CRÍTICO: Custom modules (src/modules/) precisam ser copiados via dist/
O medusa build NÃO copia custom modules para .medusa/server/
Sempre adicionar no Dockerfile stage production:
COPY --from=builder --chown=medusa:medusa /app/dist ./dist

### .dockerignore obrigatório
```
.git
.env
*.log
.medusa
```
NÃO ignorar node_modules — evita npm ci dentro do Docker (25+ min)

### Dockerfile padrão validado
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN DATABASE_URL=postgres://x:x@localhost/x \
    REDIS_URL=redis://localhost:6379 \
    STORE_CORS=http://localhost \
    ADMIN_CORS=http://localhost \
    AUTH_CORS=http://localhost \
    ./node_modules/.bin/medusa build

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -S medusa && adduser -S medusa -G medusa
COPY --from=builder --chown=medusa:medusa /app/.medusa ./.medusa
COPY --from=builder --chown=medusa:medusa /app/node_modules ./node_modules
COPY --from=builder --chown=medusa:medusa /app/package.json ./
COPY --from=builder --chown=medusa:medusa /app/medusa-config.ts ./
COPY --from=builder --chown=medusa:medusa /app/tsconfig.json ./
COPY --from=builder --chown=medusa:medusa /app/dist ./dist
RUN node -e "const fs=require('fs');const f='/app/node_modules/@medusajs/utils/dist/index.js';const c=fs.readFileSync(f,'utf8');if(!c.includes('ADMIN_RELATIVE_OUTPUT_DIR')){fs.appendFileSync(f,'\nexports.ADMIN_RELATIVE_OUTPUT_DIR=\".medusa/client\";\n');}"
USER medusa
ENV NODE_ENV=production
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=90s \
  CMD node -e "require('http').get('http://localhost:9000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
```

### Regras de build — NUNCA violar
- NUNCA usar --no-cache → demora 25+ minutos
- SEMPRE usar DOCKER_BUILDKIT=1
- NUNCA rodar npm ci dentro do Docker
- Timeout mínimo 15 minutos em qualquer build
- Comando correto: DOCKER_BUILDKIT=1 docker compose build medusa

### DATABASE_URL obrigatório
Sempre com ?sslmode=disable — Postgres interno não tem SSL:
DATABASE_URL: postgresql://${DB_USER}:${DB_PASS}@postgres:5432/medusa_db?sslmode=disable

### Nginx — roteamento obrigatório
O Medusa só é acessível externamente via Nginx.
Webhooks externos (MP, Bling) chegam em api.papelariabibelo.com.br → Nginx → localhost:9000
Antes de qualquer teste de webhook externo, verificar:
nginx -t && grep -r "9000" /etc/nginx/sites-enabled/

### Módulos customizados
Path no medusa-config.ts: "./dist/src/modules/NOME"
NÃO usar "./src/modules/NOME" — src/ não existe no container de produção
Após criar qualquer módulo novo → rebuild obrigatório

### Comandos do dia a dia
```bash
# Health check
curl -s http://localhost:9000/health

# Logs em tempo real
docker compose logs -f medusa --tail=30

# Rebuild correto
DOCKER_BUILDKIT=1 docker compose build medusa && docker compose up -d medusa

# Aguardar health após rebuild
for i in $(seq 1 24); do sleep 5; S=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/health 2>/dev/null); echo "$i: $S"; [ "$S" = "200" ] && echo "OK" && break; done

# Criar admin user
docker compose exec medusa npx medusa user -e EMAIL -p SENHA

# Migrations manuais
docker compose exec medusa npx medusa db:migrate

# Testar webhook local
curl -v -X POST http://localhost:9000/webhooks/mercadopago \
  -H "Content-Type: application/json" \
  -d '{"type":"payment","data":{"id":"123"}}'
```

### Problemas conhecidos e soluções
| Problema | Causa | Solução |
|---|---|---|
| Cannot find module './src/modules/X' | dist/ não copiado para container | Adicionar COPY dist/ no Dockerfile |
| ADMIN_RELATIVE_OUTPUT_DIR undefined | Bug versão 2.13.5 | Patch no utils/dist/index.js + admin: disable: true |
| ENOTEMPTY no npm install | node_modules corrompido | rm -rf node_modules package-lock.json && npm install |
| Connection refused porta 9000 | Container caiu ou ainda subindo | Aguardar 90s, verificar logs |
| 404 em webhook externo | Nginx sem bloco para api.papelariabibelo.com.br | Criar site no Nginx + certbot SSL |
| npm ci demora 25+ min | Baixando 1228 pacotes do zero | Não ignorar node_modules no .dockerignore |

### Admin Dashboard — status da investigação
- ADMIN_RELATIVE_OUTPUT_DIR: patch funcionando, retorna ".medusa/client" ✅
- index.html existe em /app/.medusa/client/index.html ✅
- Erro persiste: rootDirectory em runtime pode não ser /app
- Investigando: qual valor de rootDirectory o `npx medusa start` usa
- Possível causa: CWD diferente de /app quando medusa start é chamado via CMD sh -c
- Tentativa de fix pendente: garantir que rootDirectory = /app

### Admin Dashboard — RESOLVIDO em 01/04/2026
Causa: admin-bundler usa ADMIN_RELATIVE_OUTPUT_DIR = "./public/admin"
       (de @medusajs/medusa/dist/utils/admin-consts.js, NÃO do @medusajs/utils)
Solução no Dockerfile stage production:
  COPY --from=builder --chown=medusa:medusa /app/.medusa/client ./public/admin
Acesso: http://localhost:9000/app (via SSH tunnel)
Admin user: contato@papelariabibelo.com.br
