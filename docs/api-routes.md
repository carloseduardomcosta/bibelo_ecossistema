# Rotas da API — BibelôCRM

Referência completa de todos os endpoints.

---

## Públicas (sem auth)
- `GET  /health` — status da API e banco
- `POST /api/auth/google` — recebe credential Google, retorna accessToken + refreshToken

## Protegidas (Bearer JWT obrigatório)

### Auth
- `GET  /api/auth/me`
- `POST /api/auth/logout`

### Customers
- `GET  /api/customers` — lista paginada com filtros (search, segmento, canal_origem, ordenar)
- `GET  /api/customers/stats` — KPIs: total, com email, com WhatsApp, novos 30d, inativos, score
- `GET  /api/customers/:id` — perfil completo + score
- `POST /api/customers` — criar/atualizar (upsert por email)
- `PUT  /api/customers/:id` — atualizar dados
- `GET  /api/customers/:id/timeline` — histórico de interações

### Analytics
- `GET  /api/analytics/overview` — KPIs gerais
- `GET  /api/analytics/revenue` — receita por mês
- `GET  /api/analytics/segments` — clientes por segmento

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
- `GET  /api/flows/:id` — detalhes + 50 execuções recentes
- `POST /api/flows` — criar fluxo (gatilho, steps, ativo)
- `PUT  /api/flows/:id` — atualizar fluxo
- `POST /api/flows/:id/toggle` — ativar/desativar
- `GET  /api/flows/:id/executions/:execId` — detalhe execução + steps

### Página de Links — menu.papelariabibelo.com.br (público)
- `GET  /` — página HTML com links da Bibelô (Nginx rewrite → /api/links/page)
- `GET  /api/links/go/:slug` — redirect com tracking de clique + UTM automático
- `GET  /api/links/formulario` — formulário de cadastro (nome, email, WhatsApp)
- `POST /api/links/lead` — captura lead do formulário, cria customer + deal, notifica admin
- `GET  /api/links/stats` — stats de cliques por link (últimos 30 dias)

### Webhooks (validação HMAC)
- `POST /api/webhooks/nuvemshop` — recebe eventos da NuvemShop + dispara fluxos automáticos
- `POST /api/webhooks/bling` — recebe eventos do Bling (contatos, pedidos, estoque)
