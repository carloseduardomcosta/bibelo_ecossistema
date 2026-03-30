# CLAUDE.md — BibelôCRM

Guia completo para o agente Claude Code operar o projeto BibelôCRM.
Leia este arquivo inteiro antes de executar qualquer tarefa.

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
│   │   │   ├── orders.ts       ← lista pedidos Bling paginada + stats + detalhe
│   │   │   ├── sync.ts          ← status, sync manual, OAuth Bling
│   │   │   ├── products.ts     ← CRUD produtos, estoque, lucratividade
│   │   │   ├── financeiro.ts   ← módulo financeiro completo (20+ endpoints)
│   │   │   ├── nf-entrada.ts  ← upload XML NF-e, parse, contabilização
│   │   │   ├── contas-pagar.ts ← contas a pagar Bling + pagamento
│   │   │   ├── search.ts      ← busca global (clientes, produtos, NFs, lançamentos)
│   │   │   ├── flows.ts       ← CRUD fluxos automáticos + stats + execuções
│   │   │   ├── leads.ts       ← captura leads + verificação email + confirm + stats + config popups
│   │   │   ├── leads-script.ts ← GET /api/leads/popup.js — script JS popup + exit-intent
│   │   │   ├── email.ts       ← descadastro 1-click LGPD (público, HMAC token)
│   │   │   ├── tracking.ts    ← eventos tracking + timeline + stats + funil + geo + UTM (público + protegido)
│   │   │   ├── tracking-script.ts ← GET /api/tracking/bibelo.js — script tracking NuvemShop + captura UTM
│   │   │   └── links.ts      ← página de links (substitui Linktree) + redirect com tracking de cliques
│   │   ├── services/
│   │   │   ├── customer.service.ts ← upsert, score, timeline, segments
│   │   │   └── flow.service.ts    ← motor de fluxos: trigger, execute, advance, carrinho abandonado, visitou-não-comprou
│   │   ├── integrations/
│   │   │   ├── bling/
│   │   │   │   ├── auth.ts      ← OAuth2 completo
│   │   │   │   └── sync.ts      ← syncCustomers, syncOrders, incremental
│   │   │   ├── nuvemshop/
│   │   │   │   ├── auth.ts      ← OAuth2 + token + rate-limited requests
│   │   │   │   ├── sync.ts      ← syncNsCustomers, syncNsOrders, syncNsProducts, registerWebhooks
│   │   │   │   └── webhook.ts   ← HMAC + fetch full object + processamento
│   │   │   ├── resend/
│   │   │   │   └── email.ts    ← sendEmail, sendCampaignEmails, tracking
│   │   │   └── whatsapp/        ← (pendente)
│   │   │   (bling/webhook.ts    ← webhook handler Bling: contatos, pedidos, estoque)
│   │   ├── queues/
│   │   │   ├── sync.queue.ts    ← BullMQ: sync 30min + scores 2h + reativação churn
│   │   │   └── flow.queue.ts    ← BullMQ: process steps (1min) + check abandoned (5min) + check interest (15min)
│   │   ├── middleware/
│   │   │   └── auth.ts          ← JWT authMiddleware + requireAdmin
│   │   ├── db/
│   │   │   ├── index.ts         ← Pool + query/queryOne helpers
│   │   │   └── migrate.ts       ← migration runner
│   │   └── utils/
│   │       ├── logger.ts        ← Winston logger
│   │       └── geoip.ts         ← resolve IP → cidade/estado/país (MaxMind offline)
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
│   │   │   ├── NfEntrada.tsx    ← upload XML NF-e, lista, detalhe, contabilizar
│   │   │   ├── ProdutoPerfil.tsx ← detalhe produto + estoque + vendas
│   │   │   ├── Pedidos.tsx      ← lista pedidos Bling + filtros + detalhe + KPIs
│   │   │   ├── Vendas.tsx       ← formas pagamento + NF-e emitidas
│   │   │   ├── ContasPagar.tsx  ← contas a pagar Bling
│   │   │   ├── Relatorios.tsx   ← DRE, Fluxo Projetado, Comparativo Mensal
│   │   │   ├── Marketing.tsx   ← automações, leads, fluxos, KPIs (3 abas)
│   │   │   └── Sync.tsx         ← painel Bling/NuvemShop + logs
│   │   ├── components/
│   │   │   ├── Layout.tsx       ← sidebar grupos + header com busca global
│   │   │   ├── ProtectedRoute.tsx ← redirect se não autenticado
│   │   │   ├── Toast.tsx        ← ToastProvider + useToast (sucesso/erro/warning)
│   │   │   └── GlobalSearch.tsx ← busca global Ctrl+K + navegação teclado (↑↓ Enter)
│   │   ├── hooks/               ← useCustomers, useCampaigns etc
│   │   └── lib/
│   │       ├── api.ts           ← Axios + JWT interceptor
│   │       ├── auth.tsx         ← AuthContext + useAuth + Google login
│   │       ├── export.ts        ← exportCsv() utilitário reutilizável
│   │       └── format.ts        ← formatDate, formatDateTime, formatCurrency, formatMonth, timeAgo
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
- `tracking_events` — page views, produto visualizado, add to cart, busca, checkout + geo (ip, cidade, estado, país, lat/lon)
- `visitor_customers` — vínculo visitor_id → customer_id (identifica anônimos)

### schema: marketing
- `templates` — templates de e-mail e WhatsApp
- `campaigns` — campanhas com métricas (abertura, clique, conversão)
- `campaign_sends` — registro individual de cada envio
- `flows` — fluxos automáticos com steps em JSON
- `flow_executions` — execução por cliente (metadata JSONB, proximo_step_em)
- `flow_step_executions` — rastreamento granular de cada step executado
- `pedidos_pendentes` — pedidos NuvemShop aguardando pagamento (detecção carrinho abandonado)
- `leads` — emails capturados via popup (email, nome, telefone, cupom, fonte, convertido)
- `popup_config` — configuração dos popups de captura (título, tipo, delay, cupom, campos)

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
- `notas_entrada` — NFs de compra (número, chave, fornecedor, valores, XML, status)
- `notas_entrada_itens` — itens da NF (produto, qtd, valor, NCM, CFOP, impostos)

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
- `GET  /api/customers` — lista paginada com filtros (search, segmento, canal_origem, ordenar)
- `GET  /api/customers/stats` — KPIs: total, com email, com WhatsApp, novos 30d, inativos, score
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
- `GET  /api/auth/nuvemshop` — retorna URL de autorização OAuth NuvemShop
- `GET  /api/auth/nuvemshop/callback` — callback OAuth, salva token, registra webhooks
- `POST /api/sync/nuvemshop` — sync manual (clientes, pedidos, produtos)
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

### NF de Entrada (Bearer JWT obrigatório)
- `POST /api/financeiro/nf-entrada` — upload XML NF-e (multipart/form-data), parse automático
- `GET  /api/financeiro/nf-entrada` — lista paginada (filtros: status, search, mes)
- `GET  /api/financeiro/nf-entrada/:id` — detalhe com itens
- `POST /api/financeiro/nf-entrada/:id/contabilizar` — gera lançamento no financeiro
- `DELETE /api/financeiro/nf-entrada/:id` — cancelar NF (e lançamento se contabilizada)
- `GET  /api/financeiro/nf-entrada/resumo/geral` — KPIs (total, pendentes, contabilizadas, valores)

### Pedidos (Bearer JWT obrigatório)
- `GET  /api/orders` — lista paginada (search, canal, status, periodo, ordenar)
- `GET  /api/orders/stats` — KPIs: total, receita, ticket médio, físico/online, variação
- `GET  /api/orders/:id` — detalhe com itens e parcelas de pagamento

### Busca Global (Bearer JWT obrigatório)
- `GET  /api/search?q=texto` — busca em clientes, produtos, lançamentos e NFs

### Campanhas — Resend (Bearer JWT obrigatório)
- `GET  /api/campaigns/resend-status` — status da integração Resend
- `POST /api/campaigns/test-email` — enviar email de teste
- `POST /api/campaigns/:id/send` — disparo real via Resend (email) em background

### Relatórios Financeiros (Bearer JWT obrigatório)
- `GET  /api/financeiro/dre` — DRE simplificado (param: periodo ou mes)
- `GET  /api/financeiro/fluxo-projetado` — fluxo de caixa: 6m realizado + 3m projetado
- `GET  /api/financeiro/comparativo` — comparativo mês a mês (param: meses=2..12)

### Tracking Comportamental (endpoints públicos — sem auth)
- `GET  /api/tracking/bibelo.js` — script JS de tracking (servido via webhook.papelariabibelo.com.br)
- `POST /api/tracking/event` — registrar evento (page_view, product_view, add_to_cart, search, etc.)
- `POST /api/tracking/identify` — vincular visitor_id a customer (email)

### Tracking Comportamental (Bearer JWT obrigatório)
- `GET  /api/tracking/timeline` — feed real-time de eventos (paginado)
- `GET  /api/tracking/stats` — KPIs: eventos, visitantes, produtos vistos, top produtos
- `GET  /api/tracking/geo` — geolocalização dos visitantes (por estado, cidade, país) (param: dias)
- `GET  /api/tracking/funnel` — funil do site (visitantes → produto → carrinho → checkout → compra)
- `GET  /api/tracking/visitor/:vid` — histórico de um visitante

### Email / LGPD (endpoints públicos — sem auth)
- `GET  /api/email/unsubscribe` — descadastro 1-click (HMAC token, marca email_optout)

### Caça-Leads (endpoints públicos — sem auth)
- `GET  /api/leads/config` — retorna popups ativos (config dinâmica)
- `GET  /api/leads/popup.js` — script JS do popup (servido via webhook.papelariabibelo.com.br)
- `POST /api/leads/capture` — capturar lead (envia email de verificação, NÃO entrega cupom)
- `POST /api/leads/view` — registrar exibição do popup
- `GET  /api/leads/confirm` — confirma email via HMAC token, entrega cupom, dispara fluxo boas-vindas

### Caça-Leads (Bearer JWT obrigatório)
- `GET  /api/leads` — listar leads capturados (paginado, search, status, ordenar)
- `GET  /api/leads/stats` — KPIs: total, 7d, 30d, convertidos, taxa, popups
- `PUT  /api/leads/popups/:id` — atualizar config do popup

### Fluxos Automáticos (Bearer JWT obrigatório)
- `GET  /api/flows` — listar fluxos com contagem de execuções
- `GET  /api/flows/stats/overview` — KPIs: fluxos ativos, execuções, carrinhos
- `GET  /api/flows/:id` — detalhes + 50 execuções recentes
- `POST /api/flows` — criar fluxo (gatilho, steps, ativo)
- `PUT  /api/flows/:id` — atualizar fluxo
- `POST /api/flows/:id/toggle` — ativar/desativar
- `GET  /api/flows/:id/executions/:execId` — detalhe execução + steps

### Página de Links — menu.papelariabibelo.com.br (público — substitui Linktree)
- `GET  /` — página HTML com links da Bibelô (servida via Nginx rewrite → /api/links/page)
- `GET  /api/links/go/:slug` — redirect com tracking de clique + UTM automático
- `GET  /api/links/formulario` — formulário de cadastro (nome, email, WhatsApp)
- `POST /api/links/lead` — captura lead do formulário, cria customer + deal, notifica admin por email
- `GET  /api/links/stats` — stats de cliques por link (últimos 30 dias)

### Webhooks (validação HMAC)
- `POST /api/webhooks/nuvemshop` — recebe eventos da NuvemShop + dispara fluxos automáticos
- `POST /api/webhooks/bling` — recebe eventos do Bling (contatos, pedidos, estoque)

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

### Protocolo de validação de segurança

Após **qualquer implementação ou ajuste** no projeto, o agente DEVE rodar uma validação de segurança antes de finalizar a sessão:

1. **SQL Injection** — verificar que TODAS as queries usam parâmetros `$1, $2` — nunca interpolação `${var}` em SQL. Para intervalos de tempo, usar `make_interval(days => $1)` em vez de `INTERVAL '${dias} days'`
2. **XSS** — toda variável renderizada em HTML (páginas, emails, scripts) DEVE ser sanitizada com `esc()` (helper que escapa `& < > "`)
3. **Rate Limiting** — todo endpoint público (sem auth) DEVE ter `publicLimiter` do express-rate-limit
4. **HMAC tokens** — usar `timingSafeEqual` com verificação de tamanho + prefixo de domínio (ex: `"lead-verify:"`) para evitar cross-use entre features
5. **Logs** — nunca logar secrets, tokens JWT, ou senhas. Erros para o cliente devem ser genéricos
6. **Inputs** — validar com Zod em rotas que recebem dados do usuário
7. **Dados em HTML** — nomes de clientes, emails, nomes de produtos vindos do banco podem conter XSS — sempre escapar antes de renderizar

Executar: `Agent de QA/segurança` para auditar os arquivos modificados na sessão.

### Regras anti-redundância de emails e fluxos
- **triggerFlow nunca re-executa** — se já existe execução (ativa, concluída ou erro), ignora. Evita duplicatas.
- **Reativação só para quem já comprou** — fluxo `customer.inactive` só dispara se o cliente tem pelo menos 1 pedido (NuvemShop ou Bling). Leads puros sem compra NÃO recebem email de "sentimos sua falta".
- **Testes de email: SEMPRE no email do Carlos** — `carloseduardocostatj@gmail.com`. Nunca disparar triggerFlow manualmente para clientes/leads reais. Criar customer de teste se necessário.
- **Captura de lead vincula visitor** — ao capturar lead via popup, o `visitor_id` é vinculado ao `customer_id` na tabela `visitor_customers` e tracking_events anteriores são retroativamente atribuídos.
- **Cada email enviado por fluxo registra interação** — inserido em `crm.interactions` com tipo `email_enviado` para aparecer na timeline do cliente.
- **Cupom só após verificação de email** — popup NÃO entrega cupom na tela. Envia email com link HMAC de confirmação. Só ao clicar o cupom é revelado e o fluxo de boas-vindas é disparado. Previne emails fake/temporários.
- **Opt-out LGPD respeitado em tudo** — clientes com `email_optout=true` são excluídos de campanhas (sends marcados como 'ignorado') e fluxos automáticos (steps de email cancelados). Link de descadastro no footer de todos os emails.
- **Descadastro notifica o admin** — ao fazer opt-out, email é enviado para carloseduardocostatj@gmail.com com dados do cliente.
- **IP real do visitante**: Tracking resolve IP via `X-Forwarded-For` quando request vem do proxy Docker (172.21.x). Nunca usar `req.socket.remoteAddress` direto em endpoints públicos atrás de Nginx.
- **Busca de email sempre case-insensitive** — `LOWER(email) = LOWER($1)` em upsertCustomer, identify, e qualquer lookup por email. Evita duplicatas por diferença de capitalização.

---

## Testes automatizados

Framework: **Vitest 1.6** + **Supertest** (testes de integração contra banco real)

```bash
# Rodar todos os testes
bash scripts/test.sh

# Rodar um arquivo específico
bash scripts/test.sh src/routes/leads.test.ts
```

### Cobertura atual (30 testes)
- `health.test.ts` — 1 teste (health check)
- `email.test.ts` — 6 testes (unsubscribe: validação, HMAC, XSS, idempotência)
- `leads.test.ts` — 14 testes (capture, confirm, verificação email, SQL injection, case sensitivity)
- `orders.test.ts` — 9 testes (auth, lista, filtros, stats, detalhe com itens/custo)

### Regras para testes
- Todo endpoint público novo DEVE ter testes de: validação de input, token inválido, XSS
- Todo endpoint protegido DEVE testar: 401 sem token, resposta com token válido
- Dados de teste DEVEM ser limpos no `afterAll`
- Testes rodam contra o banco real (via rede Docker) — não usar mocks de DB
- Script `scripts/test.sh` resolve IPs dos containers automaticamente

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

### Bling Webhooks (real-time)
- Subdomínio dedicado: `webhook.papelariabibelo.com.br` (DNS-only, sem Cloudflare Access)
- SSL Let's Encrypt, Nginx só aceita POST em `/api/webhooks/*`
- Eventos: pedidos, estoque, produtos, NFs, NFC-e, fornecedores
- HMAC SHA256 com `BLING_CLIENT_SECRET` para validação
- Formato: `body.event` = `order.created`, `stock.updated`, etc. — dados em `body.data`

### NuvemShop
- OAuth2: token nunca expira, sem refresh — app_id `26424`
- API Base: `https://api.nuvemshop.com.br/v1/{store_id}/`
- Header auth: `Authentication: bearer` (NÃO `Authorization`)
- Rate limit: 2 req/s com burst de 40 (leaky bucket)
- 9 webhooks registrados: order/created, order/updated, order/paid, order/fulfilled, order/cancelled, customer/created, customer/updated, product/created, product/updated
- Webhook URL: `https://webhook.papelariabibelo.com.br/api/webhooks/nuvemshop`
- Webhook payload: apenas `{store_id, event, id}` — busca objeto completo via API
- HMAC: `x-linkedstore-hmac-sha256` com `client_secret`
- Caça-Leads: `https://webhook.papelariabibelo.com.br/api/leads/popup.js` (script JS público via GTM)

### Resend (e-mail)
- SDK oficial — `import { Resend } from 'resend'`
- Plano grátis: 3.000 e-mails/mês
- Rastreio de abertura via pixel, clique via redirect
- Remetente: `Papelaria Bibelô <marketing@papelariabibelo.com.br>`
- 14 templates no banco (6 automação + 6 campanha + 1 lead + 1 avaliação)

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
9. ~~**Motor de Fluxos**~~ ✅ — `api/src/services/flow.service.ts` — executor flows automáticos + carrinho abandonado
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
- 9640bed feat: módulo financeiro completo — fluxo de caixa, despesas fixas, simulador
- 455f6f8 feat: módulo NF de entrada — upload XML, parse, contabilização
- 6a08d46 refactor: Bling como fonte da verdade para receitas
- 8e54e61 feat: dashboard com fluxo de caixa e dados dinâmicos por período
- c4bc1c0 feat: página Vendas — formas de pagamento + NF-e emitidas do Bling
- b5eafe1 feat: Contas a Pagar do Bling
- c7bd130 feat: integração Resend ativa — disparo real de campanhas
- 35f677a fix: auditoria completa — acentos pt-BR, filtros de período, ProdutoPerfil
- 8eb833c feat: UX — toasts, busca global (Ctrl+K), export CSV
- 48dd871 fix: sync contatos busca detalhe do Bling (email, endereço, CPF)
- c1a8457 feat: Pipeline kanban + Campanhas completas com templates e Resend
- d691ceb feat: 5 templates de email com branding Papelaria Bibelô
- f3ddbf6 feat: template dinâmico de novidades — produtos das NFs no email
- 06856ba feat: template novidades com fotos dos produtos e link por item
- b2e228a feat: relatórios financeiros, sync contas a pagar, webhook Bling, NF atualiza custo produto
- a489fb4 fix: ajusta mapeamento de eventos do Bling webhook (order.*, stock.*)
- c710ff3 feat: integração NuvemShop completa — OAuth2, sync, webhooks, frontend
- 31464ea docs: NuvemShop em produção — store 7290881 conectada, 8 webhooks ativos
- ad07679 feat: motor de fluxos automáticos — carrinho abandonado, pós-compra, boas-vindas, reativação
- 078a1e8 feat: carrinho abandonado com recovery_url NuvemShop + templates de email ricos
- 2a0187b fix: normaliza formato de evento NuvemShop (order.created → order/created)
- 5b19a4c fix: sanitiza tags do Resend (remove acentos/espaços)
- 34a9b74 fix: recovery_url real do checkout NuvemShop no email de carrinho abandonado
- 7e10a8e feat: templates de automação com branding Bibelô + recovery_url corrigida
- 41fa4f5 feat: remetente "Papelaria Bibelô" + 12 templates premium com branding
- e0408c7 feat: avaliação pós-entrega — webhook order/fulfilled + email 12h após delivered
- b1be7d1 feat: caça-leads — popup de captura com cupom BIBELO10 para NuvemShop
- 93a508a feat: popup VIP 10% OFF com captura de WhatsApp + email + nome
- da4c5d3 fix: CORS cross-origin para popup na NuvemShop + headers de segurança
- e005d5c fix: popup não fecha ao clicar fora — só pelo X ou preenchendo
- 526bc6f feat: página Marketing no frontend — automações, leads, fluxos, KPIs
- 2239a18 feat: tracking comportamental + exit-intent + aba Atividade no frontend
- 77dc6c4 fix: tracking aceita sendBeacon (text/plain) + popup não repete
- 079a97d feat: "visitou mas não comprou" + funil do site no frontend
- 70a2edf fix: tracking extrai produto do DOM/meta tags em vez de LD+JSON
- 2239a18 feat: tracking comportamental + exit-intent + aba Atividade no frontend
- 5006970 feat: adiciona logo clicável nos templates de email
- 392a607 fix: logo dos emails servida via webhook (sem Cloudflare Access)
- aabe5fe fix: cor dos templates de email para rosa oficial #fe68c4
- 923fa62 feat: geolocalização visitantes, auditoria gaps, botão WhatsApp produto, Dashboard melhorias
- be0a7d2 feat: funil de leads completo — score engajamento, pipeline auto, sino notificações, drip nutrição
- 5addbc1 fix: padroniza templates de email — design único, footer correto, HTTPS imagens
- c2957c6 sec: pentest completo — auto-admin, SQL injection, XSS, IP spoof, CSP, HSTS, idempotency
- 65a6a40 fix: filtra tráfego interno do tracking — só clientes reais na Atividade
- ec2e0b9 feat: melhora lista de leads — busca, filtros, ordenação e paginação
- e3668e4 feat: melhora página Clientes — KPIs, filtros, ordenação, visual renovado
- 550a1b2 docs: atualiza CLAUDE.md — rotas, commits, página Clientes e Leads
- e893017 feat: opt-out de email LGPD — descadastro 1-click, filtro em campanhas e fluxos
- d11e2d9 feat: verificação de email para leads — cupom só após confirmar (anti-fake)
- 6662186 fix: normaliza email lowercase na captura de leads + sanitiza nome contra XSS
- d4ca1ac docs: atualiza CLAUDE.md — opt-out LGPD, verificação email leads, rotas, integrações
- 481d9c7 fix: auditoria tracking — IP real, geolocalização, upsert case-insensitive, merge duplicados
- d0d565c feat: página de links própria (substitui Linktree) + UTM tracking completo
- 3a28546 feat: novo design página de links — Nunito, banner loja, animações, formulário
- 85b27c1 fix: página de links — remove cupom, visual padrão templates Bibelô, Timbó/SC
- 262ba1e feat: menu.papelariabibelo.com.br — subdomínio dedicado para página de links
- dfe57ec fix: logo usa path relativo na página de links
- 13850e7 feat: formulário de cadastro no menu + bio atualizada
- 012e928 feat: pagina Pedidos — lista completa de compras Bling com filtros e detalhe
- 7b9fe21 feat: detalhe do pedido com itens, custo NF e lucro por produto
- e26a4f4 fix: sync Bling busca detalhe dos pedidos (itens + valor real)
- 465f22f sec: auditoria segurança — SQL injection, XSS, rate limit + protocolo no CLAUDE.md
- d89aa30 feat: testes automatizados — Vitest + Supertest, 30 testes de integração
- 5d1051e docs: atualiza CLAUDE.md — sessão completa: tracking, menu, UTM, formulário
- fffe8b5 sec+fix: auditoria completa — segurança (6 fixes), UX (6 fixes), banco (vacuum + scores)


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
| Frontend React | 🔧 dashboard + clientes + financeiro + marketing | login, dashboard, clientes, financeiro, simulador, automações/leads/fluxos |
| GitHub Actions | ✅ configurado | deploy automático no push |
| Bling OAuth2 | ✅ configurado | credenciais no .env, callback funcional |
| Bling Sync | ✅ produção | sync manual + incremental 30min + contas a pagar via BullMQ |
| Bling Webhooks | ✅ produção | webhook.papelariabibelo.com.br — pedidos, estoque, produtos, NFs, fornecedores |
| Relatórios Financeiros | ✅ produção | DRE, Fluxo Projetado, Comparativo Mensal |
| NuvemShop OAuth2 | ✅ produção | app_id 26424, store_id 7290881, token salvo, nunca expira |
| NuvemShop Sync | ✅ produção | clientes, pedidos, produtos — sync manual + webhooks real-time |
| NuvemShop Webhooks | ✅ produção | 9 webhooks — order/created,updated,paid,fulfilled,cancelled + customer/* + product/* |
| Resend E-mail | ✅ produção | remetente "Papelaria Bibelô", 14 templates, domínio verificado |
| Motor de Fluxos | ✅ produção | 10 fluxos ativos, BullMQ process-steps 1min, check-abandoned 5min, check-interest 15min, check-lead-cart 10min |
| Carrinho Abandonado | ✅ produção | detecta order/created sem paid após 2h, recovery_url real do checkout |
| Avaliação Pós-Entrega | ✅ produção | webhook order/fulfilled → email 12h após entrega (Google + site) |
| Caça-Leads (Popup) | ✅ produção | popup JS via GTM, captura email+WhatsApp, verificação email obrigatória, cupom só após confirmar |
| Verificação Email Lead | ✅ produção | HMAC token, email de confirmação via Resend, anti-fake (email temp não recebe cupom) |
| Opt-out Email (LGPD) | ✅ produção | descadastro 1-click, link em todos os emails, campanhas e fluxos respeitam opt-out |
| Evolution WhatsApp | ⏳ pendente | aguardando configuração |
| Painel Marketing Frontend | ✅ produção | 3 abas: Visão Geral (KPIs, gráficos), Fluxos (detalhe+toggle), Leads (tabela+stats) |
| Tracking Comportamental | ✅ produção | page_view, product_view, add_to_cart, search, checkout — script JS via GTM, IP real via X-Forwarded-For |
| Visitou mas não comprou | ✅ produção | detecta 2+ views do mesmo produto em 24h, email 4h depois |
| Funil do Site | ✅ produção | visitantes → produto → carrinho → checkout → compra (7d) |
| Geolocalização Visitantes | ✅ produção | geoip-lite (MaxMind offline), IP real → cidade/estado/país, filtro INTERNAL_IPS, geo endpoint filtrado |
| Score de Leads | ✅ produção | engajamento (popup +15, views +3, cart +10, emails +3), segmentos lead/lead_quente |
| Lead → Pipeline | ✅ produção | deal criado automaticamente na captura (etapa prospecção, prob 20%) |
| Notificação Leads | ✅ produção | sino mostra leads últimas 72h, badge rosa, refresh 2min |
| Drip Nutrição Lead | ✅ produção | dia 2 produtos populares, dia 5 lembrete cupom, dia 10 prova social |
| Lead Quente sem Compra | ✅ produção | checker 10min: add_to_cart sem purchase em 3h → email com cupom |
| Vinculação Visitor→Customer | ✅ produção | popup vincula visitor_id ao customer, atualiza tracking retroativo, identify case-insensitive |
| UTM Tracking | ✅ produção | script JS captura utm_source/medium/campaign da URL, persiste cookie 30d, grava em colunas dedicadas |
| Página de Links (Menu) | ✅ produção | menu.papelariabibelo.com.br — substitui Linktree, design Nunito, banner loja, formulário cadastro, cliques rastreados, UTM auto, notificação email admin |
| Segurança (Pentest) | ✅ produção | 15 fixes: SQL injection params, CSRF OAuth state, admin env var, NF-e transaction, campaign lock, XSS, IP spoof, HMAC, CSP/HSTS |
| Testes Automatizados | ✅ produção | Vitest + Supertest, 30 testes integração (health, email, leads, orders), script test.sh com Docker |
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
*Última atualização: 30 de Março de 2026 — Auditoria completa (segurança 15 fixes, UX 6 fixes, banco limpo), menu.papelariabibelo.com.br, UTM tracking, formulário cadastro, 30 testes passando*