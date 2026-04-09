# Rotas da API — BibelôCRM

Referência completa de todos os endpoints.

---

## Públicas (sem auth)
- `GET  /health` — status da API e banco
- `POST /api/auth/google` — recebe credential Google, retorna accessToken + refreshToken
- `GET  /api/images/serve/:id` — serve imagem temporária convertida (público, sem auth — usado pelo Bling para puxar imagens)

## Protegidas (Bearer JWT obrigatório)

### Auth
- `GET  /api/auth/me`
- `POST /api/auth/logout`

### Customers
- `GET  /api/customers` — lista paginada com filtros (search, segmento, canal_origem, contato, cidade, ordenar). Exclui fornecedores (CNPJ) por padrão.
- `GET  /api/customers/stats` — KPIs: total, com email, com WhatsApp, novos 30d, inativos, score
- `GET  /api/customers/cidades` — lista cidades com contagem para filtro
- `GET  /api/customers/:id` — perfil completo + score
- `POST /api/customers` — criar/atualizar (upsert por email)
- `PUT  /api/customers/:id` — atualizar dados
- `POST /api/customers/:id/reativar-email` — reverter opt-out (LGPD) com auditoria na timeline
- `GET  /api/customers/:id/timeline` — histórico unificado (interações + pedidos + tracking)
- `GET  /api/customers/:id/tracking` — histórico comportamental no site (eventos + stats)

### Analytics
- `GET  /api/analytics/overview` — KPIs gerais
- `GET  /api/analytics/revenue` — receita por mês
- `GET  /api/analytics/segments` — clientes por segmento
- `GET  /api/analytics/flow-activity?periodo=30d` — atividade de fluxos: emails recentes, próximos agendados, fluxos ativos, interações

### Campanhas
- `GET  /api/campaigns` — listar campanhas (paginada, filtro status/canal)
- `GET  /api/campaigns/:id` — detalhes + sends por status
- `POST /api/campaigns` — criar campanha
- `PUT  /api/campaigns/:id` — atualizar campanha
- `POST /api/campaigns/:id/send` — disparar campanha (cria sends, muda status)
- `GET  /api/campaigns/resend-status` — status da integração Resend
- `POST /api/campaigns/test-email` — enviar email de teste

### Templates
- `GET  /api/templates` — listar templates (filtro por canal)
- `GET  /api/templates/:id` — detalhes do template
- `POST /api/templates` — criar template
- `PUT  /api/templates/:id` — atualizar template
- `DELETE /api/templates/:id` — soft delete

### Sync / OAuth
- `GET  /api/sync/status` — status integrações + logs recentes
- `POST /api/sync/bling` — sync manual (?tipo=full|incremental)
- `GET  /api/auth/bling` — retorna URL de autorização OAuth Bling
- `GET  /api/auth/bling/callback` — callback OAuth, salva tokens, redireciona frontend
- `GET  /api/auth/nuvemshop` — retorna URL de autorização OAuth NuvemShop
- `GET  /api/auth/nuvemshop/callback` — callback OAuth, salva token, registra webhooks
- `POST /api/sync/nuvemshop` — sync manual (clientes, pedidos, produtos)

### Produtos
- `GET  /api/products` — lista paginada (busca, categoria, ativo)
- `GET  /api/products/categories` — categorias distintas
- `GET  /api/products/stock-overview` — resumo estoque + por categoria
- `GET  /api/products/analytics/profitability` — receita vs custo, top produtos, por categoria
- `GET  /api/products/:id` — detalhe + estoque por depósito + vendas

### Financeiro
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
- `GET  /api/financeiro/dre` — DRE simplificado (param: periodo ou mes)
- `GET  /api/financeiro/fluxo-projetado` — fluxo de caixa: 6m realizado + 3m projetado
- `GET  /api/financeiro/comparativo` — comparativo mês a mês (param: meses=2..12)

### NF de Entrada
- `POST /api/financeiro/nf-entrada` — upload XML NF-e (multipart/form-data), parse automático
- `GET  /api/financeiro/nf-entrada` — lista paginada (filtros: status, search, mes)
- `GET  /api/financeiro/nf-entrada/:id` — detalhe com itens
- `POST /api/financeiro/nf-entrada/:id/contabilizar` — gera lançamento no financeiro
- `DELETE /api/financeiro/nf-entrada/:id` — cancelar NF (e lançamento se contabilizada)
- `GET  /api/financeiro/nf-entrada/resumo/geral` — KPIs (total, pendentes, contabilizadas, valores)

### Pedidos
- `GET  /api/orders` — lista paginada (search, canal, status, periodo, ordenar)
- `GET  /api/orders/stats` — KPIs: total, receita, ticket médio, físico/online, variação
- `GET  /api/orders/:id` — detalhe com itens e parcelas de pagamento

### Briefing Diário
- `GET  /api/briefing?horas=24` — gera briefing completo (site, leads, vendas, automações, syncs, alertas)
- `POST /api/briefing/enviar` — envia briefing das últimas 24h por email ao admin

### Campanhas Personalizadas
- `GET  /api/campaigns/categorias` — lista categorias de produto com estoque para multi-select
- `GET  /api/campaigns/produtos?search=X` — busca produtos em estoque para seleção individual
- `POST /api/campaigns/gerar-personalizada` — gera email HTML com categorias + produto_ids + público + max_por_categoria
- `POST /api/campaigns/enviar-personalizada` — dispara campanha personalizada para clientes selecionados via Resend
- `GET  /api/campaigns/gerar-reengajamento?customer_id=X` — gera email personalizado baseado no histórico de compra do cliente
- `GET  /api/campaigns/email-events?hours=48` — retorna eventos recentes de email (opens, clicks, bounces) de campanhas e fluxos

### Busca Global
- `GET  /api/search?q=texto` — busca em clientes, produtos, lançamentos e NFs

### Tracking Comportamental (públicos — sem auth)
- `GET  /api/tracking/bibelo.js` — script JS de tracking (servido via webhook.papelariabibelo.com.br)
- `POST /api/tracking/event` — registrar evento (page_view, product_view, add_to_cart, search, etc.)
- `POST /api/tracking/identify` — vincular visitor_id a customer (email)

### Tracking Comportamental (protegidos)
- `GET  /api/tracking/timeline` — feed real-time de eventos (paginado)
- `GET  /api/tracking/stats` — KPIs: eventos, visitantes, produtos vistos, top produtos
- `GET  /api/tracking/geo` — geolocalização dos visitantes (por estado, cidade, país) (param: dias)
- `GET  /api/tracking/funnel` — funil do site (visitantes → produto → carrinho → checkout → compra)
- `GET  /api/tracking/visitor/:vid` — histórico de um visitante

### Email / LGPD (públicos — sem auth)
- `GET  /api/email/unsubscribe` — descadastro 1-click (HMAC token, marca email_optout)

### Caça-Leads (públicos — sem auth)
- `GET  /api/leads/config` — retorna popups ativos (config dinâmica)
- `GET  /api/leads/popup.js` — script JS do popup (servido via webhook.papelariabibelo.com.br)
- `POST /api/leads/capture` — capturar lead (envia email de verificação, NÃO entrega cupom)
- `POST /api/leads/view` — registrar exibição do popup
- `GET  /api/leads/confirm` — confirma email via HMAC token, entrega cupom, dispara fluxo boas-vindas

### Caça-Leads (protegidos)
- `GET  /api/leads` — listar leads capturados (paginado, search, status, ordenar)
- `GET  /api/leads/stats` — KPIs: total, 7d, 30d, convertidos, taxa, popups
- `PUT  /api/leads/popups/:id` — atualizar config do popup

### Fluxos Automáticos (protegidos)
- `GET  /api/flows` — listar fluxos com contagem de execuções
- `GET  /api/flows/stats/overview` — KPIs: fluxos ativos, execuções, carrinhos
- `GET  /api/flows/stats/reminders` — stats do lembrete de verificação: leads pendentes, lembretes enviados, lista de leads não verificados
- `GET  /api/flows/:id` — detalhes + 50 execuções recentes
- `POST /api/flows` — criar fluxo (gatilho, steps, ativo)
- `PUT  /api/flows/:id` — atualizar fluxo
- `POST /api/flows/:id/toggle` — ativar/desativar
- `GET  /api/flows/:id/executions/:execId` — detalhe execução + steps

### Página de Links — boasvindas.papelariabibelo.com.br (público)
- `GET  /` — página HTML com links da Bibelô (Nginx rewrite → /api/links/page)
- `GET  /api/links/go/:slug` — redirect com tracking de clique + UTM automático
- `GET  /api/links/formulario` — formulário de cadastro (nome, email, WhatsApp)
- `POST /api/links/lead` — captura lead do formulário, cria customer + deal, notifica admin
- `GET  /api/links/stats` — stats de cliques por link (últimos 30 dias)

### Imagens (Editor de Imagens para Marketplaces)
- `GET  /api/images/presets` — lista presets disponíveis (Shopee, NuvemShop, Loja Própria, Instagram, Custom)
- `POST /api/images/convert` — converte 1-50 imagens (multipart). Params: preset, width, height, format, quality, background, fit, removeBackground (IA). Retorna base64
- `POST /api/images/info` — metadata de 1 imagem (formato, dimensões, alpha, DPI)
- `POST /api/images/send-bling` — converte + salva em URL pública + envia ao Bling via PATCH /produtos/{id}. Params: blingProductId, preset, replaceAll (limpa imagens existentes), removeBackground (IA), etc

### Consumo de Email (protegido)
- `GET  /api/email-consumption/overview?periodo=30d` — KPIs: total enviados, entregues, abertos, cliques, bounces, spam, taxa abertura/clique, custo estimado, status SES
- `GET  /api/email-consumption/daily?periodo=30d` — envios por dia (campanhas + fluxos) para gráfico de barras
- `GET  /api/email-consumption/by-type?periodo=30d` — distribuição por tipo + top campanhas + top fluxos por volume
- `GET  /api/email-consumption/monthly` — evolução mensal (12 meses) com custo comparativo SES vs Resend

### Webhooks (público)
- `POST /api/webhooks/resend` — recebe eventos Resend (open, click, delivered, bounced, complained). Valida assinatura Svix.
- `POST /api/webhooks/ses` — recebe eventos SES via SNS (open, click, delivery, bounce, complaint). Confirma subscription automaticamente.

### Email (público)
- `GET /api/email/img/:hash` — proxy de imagens para emails (serve imagens NuvemShop/Bling cacheadas pelo nosso domínio)
- `GET /api/email/wa` — redirect WhatsApp pelo nosso domínio (evita wa.me nos emails)
- `GET  /api/images/bling-products` — busca produtos Bling por nome/SKU para seleção no editor

### Landing Pages
- `GET  /lp/:slug` — **(público)** página HTML da landing page com vitrine de produtos
- `GET  /api/landing-pages` — lista todas as landing pages (admin)
- `GET  /api/landing-pages/:id` — detalhe de uma landing page
- `POST /api/landing-pages` — criar landing page
- `PUT  /api/landing-pages/:id` — atualizar landing page
- `DELETE /api/landing-pages/:id` — remover landing page
- `POST /api/landing-pages/track/:id` — **(público)** incrementa capturas

### Webhooks (validação HMAC)
- `POST /api/webhooks/nuvemshop` — recebe eventos da NuvemShop + dispara fluxos automáticos
- `POST /api/webhooks/bling` — recebe eventos do Bling (contatos, pedidos, estoque)

---

## Medusa.js (e-commerce) — porta 9000

O Medusa.js v2 roda como serviço separado no Docker Compose, na porta **9000**.
Acesso externo: `https://api.papelariabibelo.com.br` (Nginx + SSL, DNS-only Cloudflare).
Possui seu próprio PostgreSQL (medusa_db) e banco de dados independente.
Admin dashboard desabilitado temporariamente. API REST e Store API disponíveis via Medusa padrão.

### Rotas customizadas do Medusa
- `POST /webhooks/mercadopago` — webhook Mercado Pago (validação HMAC x-signature + timingSafeEqual)

### Payment Provider: Mercado Pago Pix
- Módulo: `src/modules/mercadopago/` (compilado em `dist/src/modules/mercadopago/`)
- API: Checkout Transparente via API Orders v1 (2025)
- Métodos: Pix (bank_transfer) — cartão e boleto em fases futuras
- Credenciais: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_PUBLIC_KEY` no .env
- Webhook URL (MP): `https://api.papelariabibelo.com.br/webhooks/mercadopago`
- Eventos: Pagamentos + Order
- Idempotência: `X-Idempotency-Key` em todas as chamadas de criação

---

## Sistema (monitoramento VPS)

- `GET /api/system/status` — status completo da VPS: disco, RAM, swap, containers, SSL, git, DB, alertas
- `GET /api/system/code-stats` — linhas de código por camada do projeto

> Dados lidos de `/app/data/system-stats.json` (gerado pelo host via cron a cada 1 minuto).
> DB stats (clientes, leads, pedidos) consultados em tempo real via query.
> Alertas automáticos: disco >=75%, RAM >=90%, swap >=50%, container unhealthy, SSL <=30 dias.

---

## Firewall / SSH (admin only)

- `GET  /api/firewall/status` — conexões SSH ativas, regras UFW, IPs banidos, tentativas 24h
- `POST /api/firewall/whitelist` — adicionar IP à whitelist SSH `{ ip, label }`
- `DELETE /api/firewall/whitelist/:ip` — remover IP da whitelist SSH
- `POST /api/firewall/unban/:ip` — desbanir IP do Fail2ban

> Ações de whitelist/unban são processadas pelo host via cron (1 min).
> Dados lidos de `/app/data/firewall-stats.json` (gerado por `scripts/firewall-stats.sh`).
