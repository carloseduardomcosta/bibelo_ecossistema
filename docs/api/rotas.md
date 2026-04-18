# Rotas da API — BibelôCRM

Referência completa de todos os endpoints.

---

## Públicas (sem auth)
- `GET  /health` — status da API e banco
- `POST /api/auth/google` — recebe credential Google, retorna accessToken + refreshToken
- `GET  /api/images/serve/:id` — serve imagem temporária convertida (público, sem auth — usado pelo Bling para puxar imagens)
- `GET  /api/public/novidades?limit=20` — produtos da NF de entrada mais recente com foto + preço + descrição + estoque válidos. `limit` clamp 1-50 (NaN/negativo → 20). Retorna `{ novidades[], total, nf_numero, atualizado_em }`. Cache 5 min.
- `GET  /api/public/frete?cep=XXXXXXXX` — calcula frete PAC + SEDEX via Melhor Envio. CEP deve ter 8 dígitos. Retorna `{ cep, options: [{ id, name, price (centavos), delivery_days }] }`. Origem: CEP 89093880 (Timbó/SC). Pacote padrão: 0,5kg 10×15×20cm. Rate limit: 30 req/min. Cache 5 min. Proxy Next.js disponível em `/api/frete?cep=` (uso client-side).
- `GET  /api/public/rastreio?codigo=AN817294331BR` — rastreio de envio por código da transportadora. Também aceita `?pedido=265` (nº do pedido Bling). Retorna `{ tracking_code, servico, status: { codigo, label, cor, entregue }, ultima_atualizacao, previsao_entrega, prazo_entrega_dias, url_rastreio, pedido }`. Dados do Bling via `sync.logistica_objetos`. Refresh automático em background se dados > 1h. Rate limit: 30 req/min.

## Protegidas (Bearer JWT obrigatório)

### Auth
- `GET  /api/auth/me`
- `POST /api/auth/logout`

### Customers
- `GET  /api/customers` — lista paginada com filtros (search, segmento, canal_origem, contato, cidade, ordenar, **tipo**). `tipo=cliente` (padrão, B2C), `tipo=b2b` (somente CNPJ), `tipo=todos`. B2B excluídos automaticamente nos padrões de campanha.
- `GET  /api/customers/stats` — KPIs: total, com email, com WhatsApp, novos 30d, inativos, score
- `GET  /api/customers/cidades` — lista cidades com contagem para filtro
- `GET  /api/customers/:id` — perfil completo + score
- `POST /api/customers` — criar/atualizar (upsert por email). `canal_origem=manual` dispara fluxo Clube Bibelô automaticamente se email informado (lead verificado + triggerFlow lead.captured). Campos de endereço: `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `estado`, `cep`.
- `PUT  /api/customers/:id` — atualizar dados (inclui campos de endereço completo)
- `POST /api/customers/:id/reativar-email` — reverter opt-out (LGPD) com auditoria na timeline
- `GET  /api/customers/:id/timeline` — histórico unificado (interações + pedidos + tracking)
- `GET  /api/customers/:id/tracking` — histórico comportamental no site (eventos + stats)

### Pipeline (Deals)
- `GET  /api/deals` — lista com filtros (etapa, search)
- `GET  /api/deals/kanban` — agrupa deals por etapa + KPIs (total, valor total, valor ponderado)
- `GET  /api/deals/boasvindas-recentes` — deals criados via formulários do boasvindas nas últimas 72h (origens: `parcerias_b2b`, `grupo_vip`, `formulario`). Usado pelo sininho do CRM.
- `GET  /api/deals/:id` — detalhe do deal
- `POST /api/deals` — criar deal (customer_id*, titulo*, valor, etapa, origem, probabilidade, fechamento_previsto, notas)
- `PUT  /api/deals/:id` — atualizar deal
- `PATCH /api/deals/:id/etapa` — mover entre etapas (drag-and-drop do Kanban)
- `DELETE /api/deals/:id` — remover deal

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
- `POST /api/sync/bling/categorias` — remapeia todas as categorias Bling → produtos (full refresh do campo `categoria`)
- `POST /api/sync/bling/imagens` — busca imagens HD (`midia.imagens.internas[].link`) para produtos com miniatura ou sem foto. Body opcional: `{ blingIds: ["123","456"] }`. Roda em background, responde imediatamente. Re-executar após cadastrar/trocar fotos no Bling quando o webhook não disparar.
- `POST /api/sync/bling/gtins` — backfill de GTINs via `GET /produtos/{id}` (listing Bling não retorna gtin). Atualiza `sync.bling_products.gtin` para produtos com `gtin IS NULL`. Body opcional: `{ blingIds: ["123","456"] }`. Roda em background. O UPSERT do sync incremental preserva GTIN via `COALESCE` — nunca sobrescrito a cada ciclo.

### Categorias Sync (Bling ↔ Medusa)
Painel de mapeamento de categorias Bling → Medusa. Rota base: `/api/categorias-sync`.

- `GET  /api/categorias-sync` — lista todos os mapeamentos + stats (total, mapped, pending, ignored) + dropdown de categorias Medusa + último log de operação
- `POST /api/categorias-sync/importar` — importa categorias da API Bling (via fetchCategoryMap) e faz upsert na tabela de mapeamento. Novas categorias chegam como `pending`. Categorias internas (TESTE, TODOS OS PRODUTOS, KIT SUBLIMAÇÃO) chegam como `ignored`. Atualiza nome e hierarquia de categorias existentes sem alterar status/mapeamento.
- `PUT  /api/categorias-sync/:blingId` — salva mapeamento manual. Body: `{ status: "mapped"|"pending"|"ignored", medusa_category_id?: string|null, medusa_handle?: string|null }`. Registra no log de sincronização.
- `POST /api/categorias-sync/sincronizar` — aplica todos os mapeamentos `status=mapped` nos produtos do Medusa via `applyCategoryMappingToMedusa()`. Opera em background (responde imediatamente). Usa REPLACE (Medusa v2 substitui categorias pelo array enviado — seguro pois cada produto Bling tem exatamente 1 categoria).

**Tabelas:**
- `sync.bling_medusa_categories` — mapeamento bling_category_id ↔ medusa_category_id com status (mapped/pending/ignored), origem (manual/full), hierarquia bling_parent_id
- `sync.category_sync_log` — log de todas as operações: importar, mapear, ignorar, sincronizar

**Fluxo automático:** novo produto via webhook `product.*` → `syncBlingToMedusa()` → `syncCategoriesToMedusa()` → cria categoria no Medusa se necessário + marca `status=mapped` automaticamente. Sem ação manual necessária para novos produtos.

**Fluxo manual (painel CRM → Loja Online → Categorias Sync):**
1. "Importar do Bling" → busca categorias atuais do Bling, pendentes aparecem na lista
2. Dropdown por linha → selecionar categoria Medusa correspondente → "Mapear"
3. "Sincronizar tudo" → aplica todos os `mapped` nos produtos do Medusa (bulk update de categorias)
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
- `POST /api/financeiro/nf-entrada/sync/bling` — importa NFs de entrada diretamente da API do Bling
- `POST /api/financeiro/nf-entrada/:id/sync-imagens` — busca imagens HD para todos os produtos da NF. Resolve o fluxo "20 produtos × 10 fotos": após subir fotos no Bling, chama este endpoint → todos os produtos da NF recebem imagens HD em background. Retorna `{ total, message }`. (`GET /nfe?tipo=0`). Body: `{ dataInicial?: "YYYY-MM-DD", dataFinal?: "YYYY-MM-DD" }` (padrão: últimos 90 dias). Deduplicação por `chave_acesso`. Salva NF + itens com `codigo` e `gtin`. Propaga GTIN para `sync.bling_products` quando SKU bater. Retorna `{ total, importadas, ignoradas, erros, detalhes[] }`.
- `GET  /api/financeiro/nf-entrada` — lista paginada (filtros: status, search, mes)
- `GET  /api/financeiro/nf-entrada/:id` — detalhe com itens
- `POST /api/financeiro/nf-entrada/:id/contabilizar` — gera lançamento no financeiro
- `DELETE /api/financeiro/nf-entrada/:id` — cancelar NF (e lançamento se contabilizada)
- `GET  /api/financeiro/nf-entrada/resumo/geral` — KPIs (total, pendentes, contabilizadas, valores)

### Pedidos
- `GET  /api/orders` — lista paginada (search, canal, status, periodo, ordenar)
- `GET  /api/orders/stats` — KPIs: total, receita, ticket médio, físico/online, variação
- `GET  /api/orders/:id` — detalhe com itens, parcelas e breakdown financeiro: `valor_itens` (sem frete), `frete_estimado` (valor − itens), `custo_total`, `lucro_estimado`, `margem_percentual` (lucro calculado sobre itens, excluindo frete)

### Briefing Diário
- `GET  /api/briefing?horas=24` — gera briefing completo (site, leads, vendas, automações, syncs, alertas)
- `POST /api/briefing/enviar` — envia briefing das últimas 24h por email ao admin

### Campanhas Personalizadas
- `GET  /api/campaigns/categorias` — lista categorias de produto com estoque para multi-select
- `GET  /api/campaigns/produtos?search=X` — busca produtos em estoque para seleção individual
- `GET  /api/campaigns/novidades-nf` — produtos válidos da NF mais recente (imagem HD + URL NuvemShop). Autenticado.
- `GET  /api/campaigns/nfs` — lista últimas 20 NFs contabilizadas: `id, numero, data_emissao, fornecedor, total_itens`. Base do seletor multi-NF no wizard.
- `GET  /api/campaigns/nfs/:id/produtos` — produtos válidos de uma NF por UUID. Valida UUID → 400 se inválido. Retorna `id, nome, preco, estoque, img, url, categoria`.
- `POST /api/campaigns/gerar-personalizada` — gera email HTML. Suporta `fonte:"novidades"` + `bling_produto_ids:uuid[]` para campanha Novidades com produtos de 1 ou mais NFs. Layout adaptativo: hero (1-2), medio (3-6), catalogo (7+). Retorna `{ assunto, html, produtos[], destinatarios[] }` — `produtos[].nome` preserva variante completa. `publico` aceita: `todos`, `todos_com_email`, `nunca_contatados`, `segmento`, `manual`, **`b2b`** (somente clientes B2B). Públicos não-manuais excluem B2B automaticamente.
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
- `GET  /api/links/parcerias` — página HTML do formulário B2B (atacado, revenda, brindes corporativos, eventos)
- `POST /api/links/parcerias` — processa solicitação B2B: valida com Zod, upsert customer (canal `parcerias_b2b`), registra interação `parceria_b2b` na timeline, cria deal em `prospeccao` (prob. 40%), notifica admin por email. Campos: nome*, email*, assunto* (atacado|revenda|corporativo|evento|outro), empresa, documento (CPF/CNPJ), telefone, mensagem. Clique registrado em `marketing.link_clicks` com slug `parcerias-submit`.

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

### Revendedoras — CRUD + Pedidos + Mensagens (protegidos)
- `GET  /api/revendedoras` — lista paginada com filtros (search, nivel, status)
- `POST /api/revendedoras` — criar revendedora
- `GET  /api/revendedoras/pedidos-recentes` — últimos 10 pedidos (7 dias ou pendentes) com `pendentes` + `mensagens_nao_lidas` para sininho CRM. Retorna `{ data[], pendentes, mensagens_nao_lidas }`.
- `GET  /api/revendedoras/acessos-portal-recentes` — parceiras que fizeram OTP login nas últimas 6h. Usado pelo sininho CRM (seção "Acessos ao Portal", ícone 🔑, contagem urgentes).
- `GET  /api/revendedoras/email-templates` — lista os 3 templates editáveis (`revendedoras_boas_vindas`, `revendedoras_status_pedido`, `revendedoras_nova_mensagem`) com assunto, html e variáveis disponíveis
- `PUT  /api/revendedoras/email-templates/:slug` — atualiza assunto e HTML de um template. Body: `{ assunto, html }`. Persiste em `marketing.templates`. Próximos envios usam o template salvo; fallback para HTML hardcoded se removido do banco.
- `GET  /api/revendedoras/:id` — perfil completo com KPIs
- `PUT  /api/revendedoras/:id` — atualizar dados
- `DELETE /api/revendedoras/:id` — remover
- `GET  /api/revendedoras/:id/pedidos` — pedidos da revendedora com `mensagens_nao_lidas` por pedido
- `POST /api/revendedoras/:id/pedidos` — criar pedido (preço calculado server-side: preco_custo × markup × desconto%). Valida pedido mínimo (default R$300) — 400 com `{ error, pedido_minimo, total_atual }` se abaixo.
- `PUT  /api/revendedoras/:id/pedidos/:pedidoId/status` — alterar status (`pendente|aprovado|enviado|entregue|cancelado`). Body: `{ status, codigo_rastreio?, url_rastreio?, observacao_admin? }`. Ao `aprovado`: sincroniza pedido no Bling (não-bloqueante) e salva `bling_pedido_id`. Ao `enviado`: aceita `codigo_rastreio` + `url_rastreio` (MelhorRastreio). Se `observacao_admin`, cria mensagem automática no thread. Envia email para revendedora.
- `GET  /api/revendedoras/:id/pedidos/:pedidoId/mensagens` — lista mensagens do thread; marca mensagens da revendedora como lidas
- `POST /api/revendedoras/:id/pedidos/:pedidoId/mensagens` — admin envia mensagem; envia email para revendedora; cria notificação no sininho
- `GET  /api/revendedoras/:id/catalogo` — catálogo com preços calculados
- `GET  /api/revendedoras/:id/estoque` — estoque pessoal
- `GET  /api/revendedoras/:id/conquistas` — conquistas desbloqueadas
- `POST /api/revendedoras/:id/conquistas` — conceder conquista

### Portal Sou Parceira (auth via `iss:"souparceira"`)
- `POST /api/souparceira/login` — **(público)** login por CPF; retorna JWT com `iss:"souparceira"`
- `GET  /api/souparceira/perfil` — dados da revendedora autenticada
- `GET  /api/souparceira/catalogo` — catálogo com preços calculados (preco_custo × markup × desconto%)
- `POST /api/souparceira/pedidos` — criar pedido; preços recalculados server-side (ignora `preco_unitario` do body). Envia email para admin + cria notificação sininho.
- `GET  /api/souparceira/pedidos` — lista pedidos da parceira com `mensagens_nao_lidas` por pedido
- `GET  /api/souparceira/pedidos/:id` — detalhe do pedido + itens; marca mensagens do admin como lidas
- `GET  /api/souparceira/pedidos/:id/mensagens` — thread de mensagens; marca mensagens do admin como lidas
- `POST /api/souparceira/pedidos/:id/mensagens` — revendedora envia mensagem; envia email para admin + cria notificação sininho

### Notificações CRM — Sininho (protegidas)
- `GET  /api/notificacoes` — lista notificações com `total_nao_lidas`. Retorna `{ data[], total_nao_lidas }`.
- `PUT  /api/notificacoes/lida-tudo` — marca todas como lidas
- `PUT  /api/notificacoes/:id/lida` — marca uma notificação específica como lida

### Catálogo Fornecedor JC Atacado (protegidos)
- `GET  /api/fornecedor-catalogo/stats` — totais por status + última sync
- `GET  /api/fornecedor-catalogo/markup` — markups por categoria com contagens
- `PUT  /api/fornecedor-catalogo/markup` — atualizar markups em lote
- `GET  /api/fornecedor-catalogo/produtos` — listagem com filtros (page, limit, search, categoria, status)
- `GET  /api/fornecedor-catalogo/produtos/por-categoria` — agrupado por categoria
- `PUT  /api/fornecedor-catalogo/produtos/:id/status` — alterar status individual
- `POST /api/fornecedor-catalogo/aprovar-lote` — aprovar lista de UUIDs
- `POST /api/fornecedor-catalogo/scraper/iniciar` — iniciar scraper (body: `{ retomar?: true }`)
- `POST /api/fornecedor-catalogo/scraper/parar` — interromper scraper
- `GET  /api/fornecedor-catalogo/scraper/status` — progresso real-time (polling 3s)
- `GET  /api/fornecedor-catalogo/scraper/historico` — últimas 20 execuções

### Webhooks (validação HMAC)
- `POST /api/webhooks/nuvemshop` — recebe eventos da NuvemShop + dispara fluxos automáticos
- `POST /api/webhooks/bling` — recebe eventos do Bling: `contato.*` (upsert customer), `order.*` (salva pedido, busca detalhe para itens), `stock.*` (atualiza saldo), `product.*` (busca `GET /produtos/{id}` para imagens HD + propaga para Medusa)

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

---

## Curadoria Bling→Medusa (admin)

- `GET  /api/curadoria/stats` — contagens por status: `{ pending, approved, rejected, auto, missing_image, missing_price, unmapped_category }`
- `GET  /api/curadoria/pendentes?page=1&limit=20&status=pending` — lista paginada da tabela `sync.product_publish_control` com JOIN em `bling_products` (preco_venda, tem_foto). `status` opcional: pending | approved | rejected | auto
- `POST /api/curadoria/aprovar` — aprova SKUs em lote e publica no Medusa. Body: `{ skus: string[] }` (max 100). Admin only.
- `POST /api/curadoria/rejeitar` — rejeita SKUs, coloca Medusa em draft. Body: `{ skus: string[], motivo?: string }`. Admin only.
- `POST /api/curadoria/reset` — volta SKUs para pending. Body: `{ skus: string[] }`. Admin only.

> Porta de publicação: todo produto vindo do Bling entra como `pending` (draft no Medusa).
> Produtos já publicados não são rebaixados se o status de controle for `pending` (anti-downgrade).
> Categoria com `auto_approve = true` em `sync.bling_medusa_categories` → status inicial `auto` (direto publicado).
> Migration: `db/migrations/047_product_publish_control.sql`
> Backfill inicial: `scripts/backfill-publish-control.ts` (390 produtos — 214 approved, 176 pending)
