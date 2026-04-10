# Histórico de Commits — BibelôCRM

Para histórico completo e atualizado, usar `git log --oneline`.

## Commits principais (ordem cronológica)

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
- 262ba1e feat: boasvindas.papelariabibelo.com.br — subdomínio dedicado para página de links
- dfe57ec fix: logo usa path relativo na página de links
- 13850e7 feat: formulário de cadastro no menu + bio atualizada
- 012e928 feat: pagina Pedidos — lista completa de compras Bling com filtros e detalhe
- 7b9fe21 feat: detalhe do pedido com itens, custo NF e lucro por produto
- e26a4f4 fix: sync Bling busca detalhe dos pedidos (itens + valor real)
- 465f22f sec: auditoria segurança — SQL injection, XSS, rate limit + protocolo no CLAUDE.md
- d89aa30 feat: testes automatizados — Vitest + Supertest, 30 testes de integração
- 5d1051e docs: atualiza CLAUDE.md — sessão completa: tracking, menu, UTM, formulário
- fffe8b5 sec+fix: auditoria completa — segurança (6 fixes), UX (6 fixes), banco (vacuum + scores)
- 7e70883 docs: atualiza CLAUDE.md — auditoria completa, segurança, testes, menu
- 31e2a55 feat: inteligência de fluxos + Google Reviews + popup inteligente
- 0cbe856 fix: adapta Google Reviews para Places API (New) + configura credenciais
- bdd14a7 feat: widget de reviews Google para NuvemShop + fotos do local
- b5e84ec fix: widget reviews só aparece na home page
- bcc861e feat: widget Google Reviews NuvemShop — carrossel, fotos clientes, CORS fix
- 4438950 sec: auditoria completa — 22 fixes (7 critical, 15 high/medium)
- 1fda0cd refactor+fix: segunda rodada code review — 20 fixes medium/low
- 01d92d1 fix: bloqueia cupom para clientes existentes + popup 15s para ler mensagem
- 4a0abb4 docs: atualiza CLAUDE.md — code review completo, commits, instrução /review
- 9a039ce refactor: reduz CLAUDE.md de 48k→10k chars + cria /briefing skill
- ee482fb fix: corrige queries do skill /briefing com nomes reais das colunas
- 00b4f88 feat: portal Briefing Diário + email automático às 7h BRT
- 57f9f2f fix: auditoria completa dos fluxos automáticos — 8 correções
- ce946f9 test: 44 novos testes — fluxos + briefing + segurança (74 total)
- 8559cf9 sec: fix XSS stored em nomes de fluxo — strip HTML tags
- f74a502 feat: campanha personalizada — wizard com categorias, público e preview
- 74e276b fix: seleção individual de produtos + público "Todos com email"
- a1a97e7 fix: link de descadastro funcional no email de teste
- 2bf9639 fix: produtos mais recentes nas campanhas + link descadastro corrigido
- 5d3e699 fix: mensagem de erro clara quando todos destinatários fizeram opt-out
- 588e075 feat: banner opt-out no perfil do cliente + botão reativar email
- 70bbf30 fix: notificações de admin para contato@papelariabibelo.com.br
- 85ef971 fix: auto-admin login apenas para carloseduardocostatj@gmail.com
- cedbc33 feat: seleção individual de produtos + max por categoria na campanha
- 5be500b feat: separa clientes de fornecedores — CNPJ auto-classificado
- c8c4c25 feat: filtros de contato e cidade na lista de clientes
- d2098f4 feat: DNS SPF/DMARC via Cloudflare API — Hostinger + Resend, hardfail, DMARC quarantine
- bef1a30 fix: sync incremental Bling busca detalhe quando email vazio
- 8f25010 feat: detalhe da campanha — modal com destinatários e KPIs
- b5d456a fix: botão Ver na campanha concluída
- aeb780f feat: estrutura base e-commerce — Medusa.js + Next.js storefront (homolog)
- 1789f15 feat: Medusa.js v2 integrado ao ecossistema Bibelô
  - Medusa.js v2 Dockerfile multi-stage com build otimizado
  - PostgreSQL sem SSL (rede interna Docker), admin desabilitado temp.
  - Migrations automáticas, admin user criado
  - 12 correções de segurança e qualidade:
    - Removidos fallbacks hardcoded (JWT_SECRET, ADMIN_EMAIL, Medusa secrets)
    - XSS fix nos templates de email (Resend + flow.service)
    - Race condition fix em leads (INSERT ON CONFLICT)
    - Rate limiting concurrency-safe (Bling + NuvemShop mutex)
    - Graceful shutdown BullMQ workers
    - rawBody validation nos webhooks Bling/NuvemShop
    - Erros silenciosos (.catch(() => {})) substituídos por logging
    - Storefront Dockerfile com non-root user + npm ci
    - Frontend: token refresh, useMemo, debounce, AbortController
    - 11 empty catch blocks corrigidos no frontend
    - Layout AbortController para race conditions
    - Migration 017: indexes de performance (9 indexes)
    - N+1 fix na listagem de fluxos (LEFT JOIN + FILTER)
- 0acf658 docs: atualiza documentação — sessão 01/04
- feat: Mercado Pago Pix — payment provider Medusa v2
  - Módulo `src/modules/mercadopago/` (service + types + index)
  - API Orders v1 (Checkout Transparente 2025) — Pix como bank_transfer
  - Webhook `POST /webhooks/mercadopago` com validação HMAC (x-signature + timingSafeEqual)
  - Idempotência via `X-Idempotency-Key` em chamadas de criação
  - Registrado em `medusa-config.ts` como payment provider
  - Env vars `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_PUBLIC_KEY` no docker-compose
  - Dockerfile: `COPY dist/src → src` para módulos customizados no container
  - Nginx: `api.papelariabibelo.com.br` → localhost:9000 (SSL + DNS-only Cloudflare)
  - Webhook testado e validado pelo simulador do Mercado Pago (200 OK)
- e2cd344 feat: Mercado Pago Pix + Admin Dashboard — Medusa v2
- f4b5838 fix: email do payer + webhook HMAC para orders — Mercado Pago
  - Admin Dashboard habilitado (Vite build → dist/public/admin)
  - Região Brasil + BRL + payment provider Pix configurados
  - Stock Location "Loja Timbó" + fulfillment set + service zone
  - Produto teste: Lápis Sparkle R$ 59,90
  - Fluxo completo testado: cart → item → frete → payment session → MP order
  - Fix email payer: context.customer > data.payer_email > fallback
  - Fix webhook: data.id via query string (formato order) + body (formato payment)
- feat: Fase 3A — Sync Bling → Medusa (produtos + estoque)
  - Novo módulo: api/src/integrations/medusa/sync.ts
  - Lê sync.bling_products + sync.bling_stock → cria/atualiza no Medusa via Admin API
  - Dedup por SKU: existente → update, novo → create
  - Estoque > 0 → published, sem estoque → draft
  - Handle único: nome + SKU (resolve variantes com mesmo nome)
  - BullMQ: job "medusa-sync-products" a cada 30min (5min após Bling sync)
  - Rota manual: POST /api/sync/medusa
  - 373 produtos sincronizados (180 publicados, 193 draft)
- d5802c2 feat: integrações Mercado Pago Pix + Bling sync + Melhor Envio OAuth2
  - Melhor Envio: OAuth2 autorizado, token salvo em sync.sync_state
  - Callback OAuth2: medusa/src/api/callbacks/melhorenvio/route.ts
  - Endpoint interno CRM: POST/GET /api/internal/melhorenvio-token
- bce6171 feat: Melhor Envio fulfillment provider — frete calculado no checkout
  - Módulo medusa/src/modules/melhorenvio/ (service + index)
  - Calcula frete via API Melhor Envio (POST /me/shipment/calculate)
  - Token OAuth2 via CRM API interna (cache 10min)
  - Shipping options PAC + SEDEX (price_type=calculated)
  - Testado: Timbó/SC → SP — PAC R$23,72 / SEDEX R$34,88
- feat: Fase 4 — Medusa → Bling (criar pedido após pagamento)
  - Subscriber medusa/src/subscribers/order-placed.ts (evento order.placed)
  - Endpoint CRM: POST /api/internal/medusa-order
  - Busca/cria contato no Bling por email antes de criar pedido
  - Pedido criado no Bling com itens, parcelas, transporte
  - Webhook Bling order.created confirmou o fluxo bidirecional
  - Testado: MDS-1001 → bling_id=25460327672
- feat: Editor de Imagens para Marketplaces + envio automático ao Bling
  - Nova rota /api/images — conversão, serve público, envio ao Bling
  - Sharp: WEBP/PNG/JPG → formato padronizado por marketplace
  - Presets: Shopee (1000x1000 JPG), NuvemShop (1024x1024), Loja Própria (1200x1200 PNG), Instagram (1080x1080)
  - Fundo branco automático, remoção de transparência, mozjpeg otimizado
  - rateLimitedPatch() no Bling sync (PATCH /produtos/{id} com rate limit + retry)
  - URL pública via api.papelariabibelo.com.br/api/images/serve/ (Nginx → porta 4000)
  - Bling processa: baixa imagem da URL, armazena no S3 interno
  - Teste real: "1 Bloquinho Adesivado postit" (ID 16621982131) — imagem cadastrada com sucesso
  - 27 testes automatizados (Vitest): auth, conversão, batch, transparência, metadata, segurança, Bling
  - Página EditorImagens no frontend com drag-and-drop, busca de produtos, envio direto
- 5c6637b feat: remoção de fundo com IA no editor de imagens
- 719e460 feat: substituir imagens no Bling — replaceAll limpa antes de enviar
- 9dd2831 fix: dark mode + busca global + proxy CORS no editor de imagens
- bccd9cf feat: Fase 0 — sync Bling → Medusa (categorias, imagens, estoque, coleções)
  - Sync de 48 categorias Bling → Medusa (com formatação pt-BR)
  - Tabela sync.bling_medusa_categories para mapeamento bling_id → medusa_id
  - imagemURL do listing Bling propagada ao Medusa (313 produtos com imagem)
  - updateMedusaProduct agora envia imagens e categorias (antes só criação)
  - Inventory levels: 378 items, 183 com estoque > 0
  - Coleções automáticas: Novidades, Mais Vendidos, Promoções
  - Webhook product.* → busca detalhe Bling → upsert → sync Medusa (real-time)
  - Documentação: requisitos-storefront, análise NuvemShop, bling-medusa-sync
- 66d45ee feat: webhook Resend + dashboard de marketing aprimorado
  - Nginx: bloco /api/images/serve/ em api.papelariabibelo.com.br → bypass Cloudflare Access
- feat: Fase 5 — Melhor Envio automático (etiqueta após pagamento, só Medusa)
  - Service: api/src/integrations/melhorenvio/shipping.ts (cart → checkout → generate → print)
  - Integrado no endpoint POST /api/internal/medusa-order (após criar pedido no Bling)
  - Dados da loja origem via env vars (STORE_CPF, STORE_CNPJ, STORE_CEP)
  - Testado: cart ME criado com sucesso (PAC R$24,13, protocolo ORD-202604131711118)
  - Checkout real desativado para teste (debita saldo ME)
  - Pedidos NuvemShop continuam pelo fluxo Bling nativo
- fix: dark mode + busca global + proxy CORS no editor de imagens
- feat: navegador de imagens Bling — busca e importa fotos direto da API
- feat: substituir imagens no Bling — flag replaceAll limpa antes de enviar
  - Descoberto: `PATCH imagensURL: []` limpa todas as imagens internas do Bling
  - Backend: dois PATCHs sequenciais (limpa + envia novas) quando replaceAll=true
  - Frontend: preview das imagens atuais ao selecionar produto, toggle "Substituir"
  - Botão muda cor (amber) quando vai substituir, mensagem de sucesso diferenciada
- feat: remoção de fundo com IA no editor de imagens
  - Lib: @imgly/background-removal-node (ONNX U2Net, local, sem API externa)
  - Dockerfile API migrado de Alpine para Debian slim (onnxruntime precisa glibc)
  - Toggle "Remover fundo (IA)" nas configurações de conversão
  - Integrado em convert e send-bling, ~10s por imagem, timeout 5min
- feat: melhorias na interface de Automações (Marketing)
  - Timeline de steps expandível nas execuções — mostra status, resultado, horário de cada step
  - Barra de progresso visual (step 2/5) em cada execução
  - Filtro de fluxos (Todos/Ativos/Inativos)
  - Modal de confirmação ao desativar fluxo com execuções ativas
  - KPI "Emails Hoje" no overview (24h, via flow_step_executions)
  - Indicador "Atualizado HH:MM:SS" no header + polling 10s na aba Atividade
  - Banner de erro global quando API falha
  - Refatoração: helper parseSteps() elimina 4 duplicações
- feat: webhook Resend para tracking de campanhas (open/click/bounce/spam)
  - Endpoint POST /api/webhooks/resend com verificação Svix HMAC
  - Atualiza campaign_sends.aberto_em/clicado_em + totais da campanha
  - Bounce marca status, spam complaint ativa opt-out LGPD automático
  - Migration 019: index em message_id para lookups rápidos
  - Auto-refresh 15s no detalhe da campanha (frontend)
- feat: proxy de imagens e links para emails (entregabilidade)
  - Imagens NuvemShop servidas pelo nosso domínio via /api/email/img/:hash (cache 7d)
  - Links WhatsApp via redirect /api/email/wa (evita domínio wa.me nos emails)
  - Nginx: bloco /api/email/ no webhook subdomain
- feat: Storefront Fase 1 — locale pt-BR, design tokens, deploy Docker
  - Fontes: Cormorant Garamond (títulos) + DM Sans (corpo) via next/font/google
  - Paleta Bibelô: cream #FAF7F2, blush #EDD5C5, rose #C9896A, bark #3D2B1F
  - Override 30+ CSS vars do @medusajs/ui-preset (bg, fg, border, button, tag)
  - ~50 arquivos traduzidos para pt-BR: nav, footer, hero, carrinho, checkout, conta, pedidos
  - Hero reescrito: "Papelaria com curadoria especial" + CTA "Conheça nossa loja"
  - Money.ts locale pt-BR (R$ 29,90), Mercado Pago (Pix) no paymentInfoMap
  - Dockerfile reescrito: Yarn 4.12 + next start direto (sem yarn workspace no runner)
  - Docker compose: serviço storefront com build network:host (SSG acessa Medusa)
  - CORS Medusa atualizado com homolog.papelariabibelo.com.br
  - Nginx homolog ativado (HTTP, auth_basic, X-Robots-Tag noindex)
  - .dockerignore, check-env-variables.js copiado no runner
  - Publishable key + região Brasil (BRL) + imagens Bling em remotePatterns
  - Container bibelo_storefront: porta 8000, 156 páginas estáticas geradas
- feat: tracking de email (Resend webhook) + motor condicional de fluxos + fluxos inteligentes
  - Migration 020: tabela marketing.email_events — armazena cada evento individual (open/click/bounce/delivered)
  - Webhook Resend atualizado: registra TODOS os eventos (não só primeiro open/click)
  - Webhook agora rastreia emails de campanhas E de fluxos (fallback para flow_step_executions)
  - Novo endpoint GET /api/campaigns/email-events?hours=48 — retorna interações recentes
  - NotificationBell atualizado — exibe opens/clicks/bounces no sino com ícones
  - Migration 021: index JSONB em flow_step_executions.resultado->>'messageId' + composite index em email_events
  - Motor condicional de fluxos: FlowStep com campos condicao, ref_step, parametros, sim, nao, proximo
  - Função evaluateCondition() com 7 tipos: email_aberto, email_clicado, comprou, visitou_site, viu_produto, abandonou_cart, score_minimo
  - advanceFlow() agora suporta branching (targetIndex) e goto (proximo)
  - Validação Zod atualizada com campos condicionais + checks de integridade
  - Novos trigger types no Zod: lead.captured, lead.cart_abandoned, product.interested, order.delivered
  - 3 fluxos inteligentes com branching (substituem os lineares):
    - Carrinho abandonado inteligente (12 steps, 5 condições)
    - Nutrição de lead inteligente (12 steps, 4 condições)
    - Reativação inteligente (10 steps, 4 condições)
  - 6 novos templates de email: carrinho reenvio, cupom recuperação, lead FOMO VIP, convite VIP, cupom exclusivo, reativação cupom
- feat: Storefront Fase 2 — cores oficiais Bibelô + menu profissional
  - Paleta oficial: pink #fe68c4, rosa #ffe5ec, amarelo #fff7c1 (consistente com NuvemShop)
  - Fonte Jost (corpo) + Cormorant Garamond (títulos) via next/font
  - Override 30+ CSS vars do Medusa UI com cores oficiais
  - Top bar amarelo: frete grátis R$199, Timbó/SC, WhatsApp
  - Mega menu categorias: 48 categorias em 6 grupos + sidebar coleções
  - Dropdown de conta: login/cadastro ou menu logado (pedidos, endereços, sair)
  - Carrinho ícone SVG + badge numérico pink
  - Hero rosa com "curadoria especial" em pink + CTA
  - Footer amarelo com logo Cormorant
  - Side menu mobile atualizado (fundo branco, texto legível)
  - Design skill atualizado com paleta oficial
- test: 306 testes automatizados — bateria massiva de integração
  - 12 novos arquivos de teste: auth, customers, campaigns, analytics, sync, products, search, tracking, webhooks, email-events, links, security
  - De 77 para 306 testes (4x)
  - security.test.ts: 43 testes (SQL injection, XSS, path traversal, headers, JWT, 13 endpoints auth)
  - flows.test.ts: 38 testes (CRUD, trigger, dedup, branching condicional)
  - tracking.test.ts: 26 testes (events, identify, bibelo.js, timeline, funnel)
  - Todos os 18 suites passando em 23s
  - Fix: XSS no nome de lead (strip HTML tags na captura)
  - Fix: import lazy do @imgly/background-removal-node (sharp não crashar testes)
- feat: cupons únicos + senha NuvemShop + grupo VIP + padronização templates + fluxos inteligentes
  - Cupons únicos por lead: gerarCupomUnico() cria BIB-NOME-XXXX via NuvemShop API (max_uses:1, first_consumer_purchase:true, expiry automático)
  - 3 cenários de cupom: carrinho abandonado (5%, 24h), nutrição lead (10%, 48h), reativação (10%, 7d)
  - Coluna nuvemshop_orders.cupom — webhook salva qual cupom foi usado no pedido
  - Senha temporária NuvemShop: gera BibXXXXX! ao criar conta, inclui no email de boas-vindas + página de confirmação + link recuperação
  - Proxy de imagens nos fluxos: proxyImageUrl() agora aplicado em emails de fluxos (antes só campanhas). Cache de 7d → 30d.
  - Link grupo VIP (boasvindas.papelariabibelo.com.br/api/links/go/grupo-vip) integrado em: popup sucesso, página confirmação, 5 templates
  - Padronização de 21 templates: logo, Cormorant Garamond título, gradiente header, divisor. "Clube Bibelô" só no lead boas-vindas.
  - CTAs atualizados para /novidades em 5 templates + página de confirmação
  - 6 novos templates: Carrinho reenvio, Cupom recuperação carrinho, Lead FOMO grupo VIP, Lead convite VIP, Lead cupom exclusivo, Reativação cupom
  - 6 fluxos inteligentes com branching: Carrinho abandonado (12 steps), Nutrição lead (12 steps), Reativação (10 steps), Produto visitado (10 steps), Lead quente (10 steps), Pós-compra (8 steps)
  - 11 novos testes condicionais cobrindo todos os caminhos de branching (carrinho 5, nutrição 3, reativação 3)
- feat: Uptime Kuma + limpeza de templates
  - Uptime Kuma configurado em status.papelariabibelo.com.br
  - DNS A record no Cloudflare (status.papelariabibelo.com.br → 187.77.254.241)
  - SSL Let's Encrypt (expira 2026-07-01)
  - Nginx reverse proxy em /etc/nginx/sites-enabled/status
  - 11 monitores: API, Frontend, Medusa, Storefront, PostgreSQL, Redis + 5 externos (NuvemShop, Webhook, Menu, CRM, API Medusa)
  - 2 canais de alerta via Resend SMTP: carloseduardocostatj@gmail.com + contato@papelariabibelo.com.br
  - 5 templates redundantes desativados (Boas-vindas x3, Novidades do Mes, Volta as Aulas) — 16 ativos
  - Template "Novidades da Semana" reescrito com design premium + produtos_grid
  - Template "Promocao Especial" reescrito com design urgencia + produtos_grid
- fix: remover criação automática de conta NuvemShop no lead capture
  - Removida criarContaNuvemShop() e gerarSenhaTemporaria() — cliente cria conta no checkout
  - Removida senha_temp da página de confirmação, triggerFlow e flow.service
  - Template "Lead boas-vindas clube" limpo no banco (bloco login/senha removido)
  - Cupom CLUBEBIBELO mantido, fluxo de verificação de email mantido
- design: melhoria layout e UX storefront Bibelô
  - Hero com grid 2x2 product cards + CTA WhatsApp (lado direito)
  - Navbar: 6 categorias horizontais (pills) + dropdown "Mais" com mega menu
  - Nova seção: strip de benefícios (frete grátis, Pix, Timbó/SC, Grupo VIP)
  - Nova seção: category pills clicáveis (6 categorias em destaque)
  - Nova seção: banner Grupo VIP WhatsApp (fundo escuro, CTA verde)
  - Product rail: grid 4 colunas, max 8 produtos
  - Product cards: badge % OFF, marca acima do nome, aspect-ratio 1:1
  - Thumbnail: fallback rosa com inicial do produto (sem imagem quebrada)
  - Price: preço antigo menor/muted, preço atual bold pink quando desconto
  - Footer: descrição da loja, ícones Instagram/WhatsApp, selos pagamento (Pix, Visa, MC, Boleto)
  - Cores mantidas 100% — zero alteração na paleta
- feat: tracking inteligente NuvemShop + dashboard Marketing enriquecido
  - bibelo.js: detecção de categorias por slug direto (não só /categorias/slug)
  - bibelo.js: páginas de conta, cleanTitle(), isKnownPath(), resource_nome no carrinho
  - Marketing.tsx: helpers extractPagePath, slugToName, trafficSource, pageLabel
  - Exibição enriquecida de eventos de tracking no dashboard
  - Novos testes condicionais de fluxo
- feat: lembrete automático de verificação de leads + card no dashboard
  - Cron job `flow-check-unverified-leads` a cada 2h via BullMQ
  - `checkUnverifiedLeads()` em flow.service.ts — máx 2 lembretes (3h + 24h)
  - Migration 022: `lembretes_enviados` e `ultimo_lembrete_em` em marketing.leads
  - Export `gerarLinkVerificacao()` de leads.ts para reuso
  - Endpoint `GET /api/flows/stats/reminders` — stats + lista de leads pendentes
  - Card "Lembrete de verificação" na aba Fluxos (Marketing.tsx) com timeline visual, stats e preview do email
  - Protocolo de testes com clientes reais adicionado ao CLAUDE.md (obrigatório perguntar antes)
- fix: corrige sync de estoque Bling→Medusa — URL usava levelId em vez de stockLocationId
  - Medusa v2 API: POST /inventory-items/{id}/location-levels/{stockLocationId} (não levelId)
  - 378 produtos atualizados com estoque correto (183 com saldo, 195 zerados)
- fix: timezone servidor e containers para America/Sao_Paulo (Brasília)
  - Servidor, todos os containers Docker, e PostgreSQL corrigidos de UTC para -03
  - timedatectl, TZ env em docker-compose, tzdata nos Dockerfiles Alpine, ALTER SYSTEM no PG
- feat: popup via banner + tracking eventos
  - popup.js: ?clube=1 (frete grátis) e ?desconto=1 (7% OFF) abrem popup imediatamente
  - Novos eventos de tracking: banner_click, popup_view, popup_submit
  - Dashboard Marketing: exibe banner clicado, oferta do popup, cadastro no CRM
  - popup_config: Clube Bibelô (timer), 7% OFF (banner-only), exit intent (frete grátis)
  - Cupom CLUBEBIBELO (frete grátis, min R$79, 1ª compra) validado na NuvemShop
  - Cupom BIBELO7 (7% OFF, 1ª compra) validado na NuvemShop
  - Links com UTM rastreáveis por posição (carrossel vs informativo)
  - 16 novos testes: popup triggers, config, segurança, XSS, rate limit, cupom binding
- feat: lembrete automático de verificação de leads + protocolo testes clientes reais
- fix: email boas-vindas Clube Bibelô reescrito
  - Tom emocional: R$79 enquadrado como "fácil com 2-3 itens"
  - Dica com exemplos de combinações de produtos
  - Sem emoji no assunto (evita spam)
  - Header mais compacto, fontes menores
- fix: unsub_link em fluxos automáticos + auditoria completa de templates
  - flow.service.ts: {{unsub_link}} adicionado às variáveis de template (LGPD)
  - 7 templates corrigidos: link de descadastro adicionado (Agradecimento, Carrinho abandonado, Produto visitado, Pedido de avaliação, Reativação, Sentimos sua falta, Última chance)
  - Template "Pós-compra" criado (faltava, referenciado pelo fluxo Boas-vindas)
  - Template "Boas-vindas" reativado (estava desativado)
  - Contadores total_ativos recalculados
  - 27 novos testes de auditoria: unsub_link, variáveis, gatilhos, dedup, LGPD, integridade
- fix: mock Resend em testes — não consome cota diária
  - sendEmail() retorna mock quando VITEST=true (automático pelo Vitest)
  - Suite completa: 360/360 testes passando (antes: 355/360)
  - Tempo da suite: 33s (antes: 60s)
  - Cota Resend protegida — testes nunca enviam emails reais
  - Simplifica existingInventory map (não precisa mais de levelId)
  - Remove silenciamento de erros (logava apenas os 5 primeiros)
- fix: preços incorretos no storefront — convertToLocale dividia centavos como reais
  - Medusa v2 retorna valores em centavos (5990 = R$ 59,90)
  - Intl.NumberFormat espera valor em unidade principal
  - Fix: dividir por 100 antes de formatar (exceto JPY)
  - Afeta: preços de produtos, carrinho, checkout, pedidos, frete
- fix(storefront): traduz textos para pt-BR + corrige imagens desfocadas
  - Product tabs: informações do produto, envio e devoluções
  - Free shipping nudge: frete grátis desbloqueado, faltam X
  - Order summary: resumo do pedido, desconto, frete, impostos
  - Imagens: quality 95, sizes px reais, next.config com AVIF/WebP + cache 24h
- feat: popup forçável via banner (?clube=1 ou ?desconto=1)
  - tracking: novos eventos banner_click, popup_view, popup_submit
  - dashboard Marketing: exibe novos eventos com ícones e metadata
  - testes: 8 novos testes para popup banners
- feat: Clube VIP WhatsApp — formulário nome+email + redirect + tracking
  - Página intermediária em /api/links/grupo-vip com captura antes de entrar no grupo
  - Cria lead+customer+deal no CRM, email boas-vindas + notificação admin
  - Rename "Grupo VIP" → "Clube VIP" em todos os templates e popups
  - Clube VIP em destaque no menu: primeiro link com animação pulsante + sparkle
- feat: formulário Parcerias B2B (/api/links/parcerias)
  - 7 campos: nome, empresa, CPF/CNPJ, telefone, email, assunto (select), mensagem
  - Cria customer+deal+interação no CRM, notifica admin por email formatado
  - Design azul profissional (diferenciado do B2C rosa)
- feat: migra menu → boasvindas.papelariabibelo.com.br
  - Novo subdomínio com SSL Let's Encrypt, Nginx configurado
  - menu.papelariabibelo.com.br → redirect 301 (links antigos não quebram)
  - Todas as referências no código e docs atualizadas
- fix: remove menção a loja física — foco no digital
- feat: copyright com CNPJ no footer de todas as páginas
- feat: integração Amazon SES + dashboard de consumo de email
  - Provider switchável (SES/Resend) via EMAIL_PROVIDER no .env
  - Webhook SES para tracking de eventos
  - Página ConsumoEmail no frontend
- feat: ajustes visuais menu — novo slogan e remove pulsante da logo
- feat: inteligência (RFM + conversão fluxos + ROI canal + cross-sell)
- feat: integração Meta Ads — dashboard Facebook + Instagram
  - Client Meta Graph API v25.0 (cache 5min, retry 429)
  - 6 endpoints: status, overview, campaigns, demographics, geographic, platforms
  - Dashboard com KPIs, tendência diária, plataformas, campanhas, gênero, faixa etária, regiões
  - Guia de setup interativo quando não configurado
  - Token longa duração (60 dias) configurado
  - Foco: público feminino Sul/Sudeste
- feat: persistir dados Meta Ads no banco + sync automático 6h
  - Migration 025: 6 tabelas (campaigns, insights_daily, insights_account, demographics, geographic, platforms)
  - Service meta.service.ts: sync completo Meta → banco (últimos 30 dias, UPSERT)
  - Job BullMQ meta-ads-sync a cada 6h + endpoint POST /sync manual
  - 7 endpoints /historico/* para consulta de dados persistidos do banco
  - Botão "Sync" no dashboard + indicador de registros salvos
  - Primeiro sync: 5 campanhas, 47 registros salvos
- docs: análise campanhas Meta Ads — Caderno vs Catálogo Bibelô
  - Caderno: R$7,04, 290 impressões, CTR 6.21% — performou rápido (anúncio direto)
  - Catálogo Bibelô: 6 impressões em 8h — fase de aprendizado (anúncio dinâmico)
  - Diagnóstico: catálogo dinâmico precisa 24-48h + Pixel ativo + volume de dados
  - Demográfico: mulheres 35-54 melhor engajamento, Instagram 99%
  - Geográfico: RJ lidera, seguido de RS e DF
- feat: auditoria fluxos + dashboard automações + reativação clientes
  - Fix: Redis noeviction (BullMQ exige), removidos 8 flows de teste do banco
  - Fix: race condition processReadySteps — lock atômico não era revertido
  - Fix: rate limit 12h isenta gatilhos transacionais (order.paid, order.abandoned)
  - Novo endpoint: GET /api/analytics/flow-activity (emails recentes, agendados, fluxos, interações)
  - Dashboard: seção "Automações & Emails" com 4 cards (envios, agendados, fluxos ativos, interações)
  - Reativação disparada para 2 clientes risco alto (Bruna Caroline + Maria Luiza)
- feat: visibilidade tracking leads + cupom CLUBEBIBELO shipping→percentage 7%
  - Timeline do cliente agora inclui tracking_events (page_view, product_view, add_to_cart)
  - Novo endpoint GET /customers/:id/tracking com stats comportamentais
  - Perfil do cliente: card "Comportamento no Site" + filtro timeline (Todos/Site/Pedidos)
  - Link direto do lead para perfil do cliente na aba Marketing
  - Cupom CLUBEBIBELO migrado: type:shipping → type:percentage 7% OFF (1ª compra)
  - Frete grátis agora é nativo NuvemShop (Sul/Sudeste, R$79+, opção mais barata)
  - Todos os emails, templates, popup e páginas atualizados para "7% OFF"
  - URLs do footer padronizadas: /privacidade/ e /termos-de-uso/ (8 ocorrências)
  - Footer completo adicionado em checkUnverifiedLeads, paginaClienteExistente, paginaErroVerificacao
  - Template "Lead boas-vindas clube" corrigido no banco (assunto + HTML)
  - Popup delay: 8s → 3s
- fix: tracking carrega via popup.js + anti-iframe + add_to_cart form submit
  - popup.js auto-carrega bibelo.js (sem depender de tag GTM separada)
  - bibelo.js ignora iframes (GTM preview gerava eventos falsos)
  - Seletores add_to_cart ampliados (NuvemShop Amazonas)
  - Fallback: intercepta form submit de produto
  - Teste automatizado do pipeline completo: 6 eventos → lead → verificação → fluxo disparado
- fix: popup não repete entre páginas + botão "Continuar comprando"
  - localStorage como fallback do cookie (aba anônima/cross-page)
  - Botão "Continuar comprando" aparece após preencher popup
  - Cache popup.js reduzido de 5min para 1min
- fix: template "Lead boas-vindas clube" redesenhado
  - 6 produtos mais vendidos (últimos 6 meses, dados reais Bling) em grid 3x2
  - 3 reviews reais do Google com foto do perfil + foto de produto compartilhada
    - Bruna Caroline, Sonia Ewald, Bruna Penz (todas 5⭐, com fotos reais)
  - Link "Ver todas as avaliações no Google →" para Google Maps da Bibelô
  - "⭐ 5.0 no Google · 23 avaliações reais" (dado real via Places API)
  - Removidos textos fictícios ("4.9 no Google", "+500 clientes", review inventado)
  - Imagem quebrada (Caneta Glitter 403) substituída por Marca Texto Picnic Bombom
  - Benefícios com emojis: 🏷️ 7% OFF, 🚚 frete, 🎁 mimo, ✨ novidades, 💬 WhatsApp
  - Footer com Privacidade + Termos de Uso + Descadastrar
- Teste manual completo validado (celular, guia normal):
  - Pipeline: page_view → popup_view → popup_submit → product_view → add_to_cart → verificação email → fluxo disparado → email boas-vindas enviado
  - 7 eventos captados, todos vinculados ao customer
  - Fluxo "Lead boas-vindas clube" concluído + "Nutrição de lead inteligente" ativo
- feat: auditoria completa emails NuvemShop vs CRM + refatoração templates
  - Mapeamento NuvemShop vs BibelôCRM: 9 transacionais ficam na Nuvem, CRM faz marketing/nurture
  - Carrinho abandonado: NuvemShop (~30min) primeiro toque + CRM (2h+) fluxo completo — cadeia sem duplicação
  - Delay step 1 carrinho abandonado: 1h → 2h (evita colisão com NuvemShop)
  - 4 templates de carrinho melhorados:
    - buildAbandonedCartEmail: +banner frete grátis, +escHtml, emoji 🎀 rosa
    - buildLastChanceEmail: +imagens produtos, +social proof urgência, +frete
    - buildCartReminderEmail: NOVO (antes fallback genérico) — social proof Google 4.9 + frete
    - buildCartCouponEmail: NOVO (antes fallback genérico) — cupom 5% em destaque visual
  - 7 templates que caíam no fallback genérico corrigidos:
    - buildNewsEmail: "Novidades da Semana" — produtos recentes do tracking
    - buildLeadCouponEmail: "Lead cupom exclusivo" — cupom em destaque
    - buildFomoVipEmail: "Lead FOMO grupo VIP" — grupo WhatsApp 115 membros
    - buildProductVisitedEmail: "Produto visitado" — imagem + preço + link do produto
    - buildVipInviteEmail: "Lead convite VIP" — convite WhatsApp VIP
    - buildReviewRequestEmail: "Pedido de avaliação" — 5 estrelas + CTA Google Reviews
    - "Sentimos sua falta" agora matcha buildReactivationEmail
  - buildCartProductsTable(): helper reutilizável para tabela de produtos com imagem
  - buildTopProductsGrid(): helper async para grid de produtos mais vistos do tracking
  - Boas-vindas e Reativação agora mostram produtos reais (top 3-4 do tracking)
  - Proxy de imagens: webp → jpg automático via Sharp (compatibilidade Outlook/Yahoo)
  - cleanProductUrl(): remove fbclid/UTMs de ads, adiciona utm_source=email
  - escHtml() aplicado em todos os 23 templates (nomes de clientes e produtos)
  - Fallback genérico agora loga warning para detecção futura
  - 23/23 templates matchando corretamente, 0 fallbacks
  - Nova documentação: docs/marketing/email-templates.md (referência completa)

### Sessão 06/04/2026

- **Editor de Imagens: download ZIP**
  - JSZip adicionado ao frontend para gerar .zip no navegador
  - Botão "Baixar todas em .zip" substitui downloads individuais sequenciais
  - Nome do ZIP: `imagens_{preset}_{N}fotos.zip`

- **Popup 10% OFF (substituiu 7%)**
  - Popup `clube_bibelo` atualizado: 7% → 10% OFF, cupom BIBELO10
  - Popup `exit_intent` também atualizado para 10% OFF
  - Popup `desconto_primeira_compra` (7%) desativado
  - Novo design: badge pulsante 22px, faixa "só pra quem cadastra aqui", botão "Quero meu desconto 🎉"
  - Animação de entrada com bounce (scale + translateY)
  - Benefícios rápidos embaixo do botão (10% OFF, Frete grátis, Mimo)
  - Email de verificação e página de confirmação atualizados para 10%
  - Cupom BIBELO10 criado automaticamente na NuvemShop (10%, 1ª compra)
  - garantirCupomClube() → garantirCupomPopup() (refatorado)

- **Fix: popup repetindo para mesma pessoa**
  - forceOpen (banner ?desconto=1) agora respeita `_bibelo_lead` — nunca reabre para quem já preencheu
  - Cookie com `domain=.papelariabibelo.com.br` — funciona em www e sem www

- **Barra de frete no topo**
  - Texto atualizado: "🚚 FRETE GRÁTIS - Leia as Políticas de Frete 🚚" com link para /politica-de-frete/
  - Barra agora usa a topbar nativa do tema (.js-topbar) — ícones sociais à esquerda, frete centralizado
  - Visível no mobile (removido d-none do tema)

### Sessão 07/04/2026

- **Evento `purchase` no tracking**
  - Webhook order/paid insere evento `purchase` no tracking_events (antes funil parava em checkout_start)
  - Guarda de idempotência: não insere duplicado em retries/order_updated
  - Exibição: card verde "Pedido #104 · R$ 147,90" na Atividade em Tempo Real

- **Vendas no sininho (NotificationBell)**
  - Novo endpoint GET /api/tracking/vendas-recentes (NuvemShop orders últimas 48h)
  - Seção verde pulsante no dropdown — primeira da lista, com nome, valor, itens, cupom
  - Botão "Ver pedidos" no footer do dropdown

- **Timeline sem duplicata**
  - Removido nuvemshop_orders do UNION da timeline — Bling é fonte da verdade
  - Antes mostrava "Pedido Online" + "Pedido Bling" para a mesma venda

- **Vinculação automática visitor→customer**
  - Webhook order/paid busca checkout_start (URL contém ns_id) → descobre visitor_id
  - Cria vínculo visitor_customers + retroativamente marca tracking_events
  - Unifica visitor_ids fragmentados (webviews Instagram/Facebook) comparando IP
  - Facebook crawler (173.252.x) corretamente excluído

- **Bloqueio de bots/crawlers**
  - Filtro em 3 camadas: bibelo.js, popup.js (client-side) + POST /event (backend)
  - Regex: facebookexternalhit, googlebot, semrushbot, ahrefsbot + 12 crawlers
  - 330 eventos falsos de bots removidos do banco (US, IE, CN, etc)

- **Bloqueio IPs internos (empresa)**
  - IP empresa 187.85.161.250 adicionado ao INTERNAL_IPS
  - IP Netskope 163.116.230.117 adicionado
  - Nova função isInternalIp() com matching por prefixo de rede
  - 82 eventos do IP da empresa removidos

- **Enriquecimento de dados do cliente (NuvemShop)**
  - Webhook order/paid agora captura: CPF, cidade, estado, CEP do billing_address
  - Sync manual de clientes também captura CEP
  - Mapa province_code NuvemShop → UF IBGE (SA→SC, DI→DF)
  - Clientes existentes enriquecidos retroativamente

- **Painel de inteligência de tráfego (Marketing → Atividade)**
  - Endpoint GET /api/tracking/analytics com 6 datasets
  - Heatmap dia×hora (CSS grid, 6 níveis de intensidade rosa)
  - AreaChart tráfego por dia (visitantes rosa + eventos azul, badge tendência semanal)
  - Barras de visitantes por hora (hora atual destacada)
  - Top fontes de tráfego (Instagram, Facebook, Google, Direto)
  - Insights automáticos: pico, tendência, conversão, oportunidade de produto
  - Timeline filtrada para últimas 24h (dados históricos preservados para analytics)

- **Sistema de ponto de restauração**
  - Script restore-point.sh: create, list, info, restore
  - pg_dump completo + dumps por tabela (15 tabelas críticas) + tag git + metadados
  - Restauração com confirmação manual + auto-backup do estado atual
  - Cron diário às 3h, retenção 30 dias
  - Primeiro ponto: 20260407_120040

- **Commits pendentes de sessões anteriores commitados**
  - 12 arquivos: templates email, proxy webp→jpg, editor imagens batch, SEO, Medusa desabilitado

- **Análise da 1ª venda rastreada end-to-end (Daniela Oliveira)**
  - Ad Instagram (Caneta Rainbow R$7) → 14 categorias em 5min → R$147,90
  - Compradora decidida, comércio local Timbó/SC, ignorou popup
  - 3 fluxos disparados: Boas-vindas, Pós-compra, Cross-sell

- **Limpeza de dados de teste**
  - Removidos: Macedo Teste, cupom-test-vitest, Cliente anônimo, test-123

### Sessão 07/04 (parte 2) — Dashboard períodos + Emails com produtos reais

- **f200d4f** — feat: filtros "Hoje" (1d) e "3 dias" (3d) nos dashboards
  - 6 páginas: Dashboard, Lucratividade, Inteligência, ConsumoEmail, MetaAds, (+ Vendas já tinha 30d+)
  - 2 backends: `periodoToInterval()` em analytics.ts e products.ts
  - Comparativo automático: "Hoje" compara com ontem, "3 dias" compara com 3 anteriores

- **8077fb5** — fix: emails automáticos puxam produtos da última NF entrada
  - Substituído `buildTopProductsGrid()` (tracking_events) por `buildNfProductsGrid()` (NF entrada)
  - Cruza itens NF → Bling (SKU) → NuvemShop (nome limpo, preço, imagem, link)
  - Afeta templates: Novidades, Reativação, Boas-vindas

- **629dc26** — fix: imagens frescas via NuvemShop API
  - URLs de imagem no banco estavam expiradas na CDN (403)
  - Busca imagens frescas diretamente da NuvemShop API a cada envio

- **be6b5c2** — fix: busca imagens via search (GET /products/{id} retorna 404)
  - Endpoint direto NuvemShop 404 → troca para `/products?q=nome` que funciona

- **70080b1** — fix: validação completa dos produtos nos emails
  - Cada produto precisa ter: imagem ✓, link pro site ✓, preço > 0 ✓
  - Se produto da última NF não atende → puxa de NFs anteriores automaticamente
  - Zero fallback lacinho — só entra produto 100% validado
  - Candidatos de todas as NFs, ordenados por data_emissao DESC
- **XXXXXX** — feat: triggerFlow no Clube VIP + templates adaptativos por fonte
  - Rota `/api/links/grupo-vip` agora dispara `triggerFlow("lead.captured")`
  - Leads VIP pulam fluxo "Lead boas-vindas clube" (já recebem welcome inline)
  - Templates "Lead FOMO grupo VIP" e "Lead convite VIP" adaptam conteúdo por fonte
  - VIP: vantagens de compra + cupom CLUBEBIBELO 7% / Popup: FOMO + convite grupo
  - Subjects diferenciados por fonte (VIP vs popup)
  - Contadores de fluxos resetados para valores reais

### Sessão 08/04/2026 — Backlog, Backup DR, Landing Pages

- **22982df** — fix: corrige 10 testes desatualizados + CI/CD com testes antes do deploy
  - leads.test.ts: popups atualizados (BIBELO10, cache 60s, desconto_primeira_compra inativo)
  - flows-audit.test.ts: aceita múltiplos fluxos por trigger + templates dinâmicos
  - deploy.yml: roda testes na VPS antes de rebuild (aborta deploy se falhar)
  - Baseline: 426/426 testes green

- **b8d6e57** — feat: backup automático no Google Drive via rclone OAuth2
  - backup.sh envia .sql.gz para Google Drive após dump local
  - Retenção: 7 dias local, 30 dias no Drive. Cron diário 3:30 AM

- **186e2de** — feat: Disaster Recovery completo — snapshot semanal no Google Drive
  - dr-backup.sh: .env, secrets, nginx, SSL, cron, PostgreSQL (CRM+Medusa), Redis, UFW, inventário
  - Cron: domingos 4h AM, retenção 60 dias, ~1.3MB comprimido

- **e0483f9** — feat: landing pages para campanhas — captura de leads via ads
  - Tabela marketing.landing_pages com slug, cupom, cores, UTMs, métricas
  - Rota pública /lp/:slug serve HTML standalone
  - CRUD admin /api/landing-pages + frontend gerenciamento com KPIs

- **774ffa1** — feat: landing pages dinâmicas com produtos reais da NF + fix Nginx
  - Vitrine: 6 produtos da última NF com validação NuvemShop (imagem + link + preço)
  - 6 LPs criadas: novidades, canetas, marca-texto, agendas, presentes, dia-das-mães
  - Nginx: location /lp/ no webhook subdomain

- **4323991** — fix: storefront-v2 — menu rosa + benefits em carrossel suave
  - TopBar: bg-bibelo-rosa (era cinza)
  - Nav bar: fundo rosa claro com bordas pink

- **03d2770** — fix: carrossel de benefícios com CSS animation
  - CSS @keyframes translateX(-50%) — loop infinito suave 20s
  - Pausa no hover/touch, funciona em qualquer tela

### Sessão 09/04/2026 — storefront-v2: carrinho, categorias, UX mobile

- fix: carrinho funcional — dual URL Medusa (Docker interno server-side + URL pública client-side)
  - client.ts detecta `typeof window` para escolher URL
  - docker-compose: NEXT_PUBLIC_MEDUSA_PUBLIC_URL para browser
  - CORS já configurado no Medusa para homolog.papelariabibelo.com.br

- feat: categorias dinâmicas buscadas da API Medusa (era hardcoded 12, agora 45+ reais)
  - Ordenação inteligente: prioritárias primeiro, depois alfabético
  - Emoji map por handle para visual consistente

- fix: carrossel viewport-fit — `calc(100svh - Xrem)` substitui aspect-ratio fixo
  - Header + carrossel + benefits cabem em 1 tela sem scroll

- fix: ícone carrinho maior (w-6), rosa fixo, badge "0" sempre visível

- fix: remove card "7% OFF" dos benefits (popup ativo é 10% OFF)
  - Remove banner cupom BIBELO7 da home page

- feat: links dos benefits apontam para URLs de produção
  - Frete Grátis → politica-de-frete (prod)
  - Clube VIP → boasvindas/api/links/grupo-vip

- fix: bloqueia pinch-to-zoom mobile — `touch-action: manipulation` no html
  - iOS ignora meta viewport user-scalable=no desde iOS 10
  - Next.js 15 viewport export (não mais meta tag manual)

- sec: hardening VPS/Nginx — auditoria completa e correções
  - H2: SSH PasswordAuthentication forçado para no (cloud-init sobrescrevia)
  - H3/H4/H5: headers de segurança (HSTS, X-Frame, CSP, Permissions-Policy) em api, status, webhook, boasvindas
  - H6: limites de recursos Docker (mem_limit + cpus) em todos os 8 containers
  - M1/M2/M3: SSH hardening — X11Forwarding no, MaxAuthTries 3, LoginGraceTime 30s
  - M4: rate limit Nginx em endpoints públicos (tracking 20r/m, leads 10r/m, landing 30r/m)
  - M7: apt upgrade — systemd, docker-ce, fwupd atualizados
  - DNS: removidos 5 registros Edrone do Cloudflare (DKIM, mail, click, sms, sparkpost)

- infra: banner MOTD "BIBELÔ" no login SSH
  - /etc/update-motd.d/01-bibelo — ASCII art + subhead "Ecossistema Papelaria Bibelo - Macedo 2026"

- infra: melhorias VPS — disco, swap, DMARC, Docker limits ativos
  - Limpeza Docker build cache: 77% → 29% disco (50 GB liberados)
  - Swap 2 GB persistente (fstab), swappiness=10 (só emergência)
  - DMARC atualizado de p=quarantine para p=reject no Cloudflare
  - Docker limits (mem_limit + cpus) aplicados — todos 8 containers com teto ativo
  - storefront_v2 restaurado para healthy após recreate

- docs: atualiza roadmap completo — Fases 1+2 concluidas, Fase 3 em andamento, Fase 4 SCM planejada
  - Fase 4 SCM: schema supply, curva ABC, ponto de pedido, historico preco, pedido de compra, score fornecedor
  - Roadmap reflete estado real do projeto em 09/04/2026

- 9459ebb feat: storefront-v2 — checkout multi-pagamento, emails transacionais, retirada na loja, 131 testes
  - Checkout: Pix (5% OFF), cartão de crédito (MP.js tokenização, até 12x), boleto bancário
  - Página de confirmação com QR Code Pix, link boleto, status cartão
  - Emails transacionais CRM (SES/Resend): confirmação pedido, pagamento aprovado, envio com rastreio
  - Medusa: subscriber payment-approved → notifica CRM → email + admin
  - Módulo retirada na loja (fulfillment provider, frete grátis, endereço Timbó/SC)
  - Healthcheck storefront-v2 corrigido (node HTTP em vez de wget spider)
  - Medusa: MP provider atualizado para suportar credit_card + boleto + pix
  - 131 testes Vitest storefront: utils, stores (cart/auth), cart API, checkout, páginas, emails
  - Endpoints: /api/internal/medusa-payment, /api/internal/medusa-shipping

- 5cf95ce feat: painel Loja Online no CRM — configurações centralizadas
  - Nova seção "Loja Online" no sidebar do CRM
  - 5 abas: Pagamento, Frete, Checkout, Marketing, Geral (31 configurações)
  - Banco: tabela public.store_settings (chave/valor com categoria e tipo)
  - API: GET /api/store-settings (público, cache 5min) + PUT autenticado
  - Frontend: toggles, inputs numéricos, campos R$ (currency), save por aba
  - Storefront lê configs dinamicamente sem rebuild

- 7e72853 feat: botão WhatsApp no produto (com link) + botão flutuante global
  - Botão verde destaque "Preciso de ajuda com este produto" com nome + URL
  - Botão flutuante (bolinha verde) em todas as páginas com pulse, tooltip, posição mobile

- f680b1f fix: store-settings — logs de auditoria, centavos→reais no CRM, 16 testes
  - Logs: GET com ip/cache/elapsed, PUT com user/antes→depois de cada campo
  - UX: campos monetários exibem R$ (tipo currency), API converte reais↔centavos
  - 16 testes: categorias, campos, auth, ranges, JSON, booleans, segurança

- fe32e97 test: E2E fluxo completo de compra — 20 testes ponta-a-ponta
  - Simula ciclo real: catálogo → carrinho → endereço → frete → pedido → email → Bling
  - Usa Medusa API real (produtos, preços, carrinho, shipping options)
  - Gera relatório com dados reais (produto, preço, cart ID, status de cada step)
  - Valida rejeição de payloads inválidos nos endpoints internos

- feat: pagina Sistema no CRM — monitoramento VPS + stats do projeto
  - Backend: api/src/routes/system.ts — 2 endpoints (/status, /code-stats)
  - Frontend: frontend/src/pages/Sistema.tsx — dashboard com KPIs, gauges, containers, SSL, codigo, git, DB
  - Script: scripts/system-stats.sh — gera JSON no host (cron 1min), montado read-only no container
  - Alertas automaticos: disco, RAM, swap, containers, SSL

- 9b0b8d1 fix: auto-refresh token Melhor Envio + validação ME/MP documentada
  - Token ME: auto-refresh quando falta menos de 5 dias para expirar
  - Validação ME: PAC R$23.72 (8d), SEDEX R$34.88 (4d) — Timbó→SP, saldo R$0
  - Validação MP: token produção OK, sandbox Pix não gera QR (limitação conhecida)
  - Endpoint dedicado: POST /api/sync/bling/categorias

- f1d3b80 fix: sync categorias→produtos Bling + propagação ao Medusa
  - syncProductCategories faz busca reversa por idCategoria (57 categorias)
  - Resultado: 361/435 produtos categorizados (antes: 23/435)
  - Caneta=52, Caderno=10, Lapiseira=9, Borracha=10 produtos cada
  - Adicionado ao full sync + endpoint dedicado POST /api/sync/bling/categorias
  - fetchCategoryMap exportado para uso externo

- 17a2d78 feat: produtos com variações (Bling pai/filhos → Medusa variants)
  - Sync agrupa por idProdutoPai: pai + filhos = 1 produto com N variantes
  - Parser: "NomePai Opção:Valor" → options + variants no Medusa
  - Antes: 435 produtos (127 filhos duplicados) → Depois: 145 produtos (32 com variantes)
  - Exemplos: CIS Spiro (8 cores), Bazze Glitter (6 tintas), Rainbow (6 cores)
  - Webhook Bling reativado: produto novo → sync Medusa em background

- cd229e4 test: E2E Bling→Storefront — 22 testes ponta-a-ponta
  - Valida: variantes com opções reais, SKUs únicos, preços, categorias
  - Filtro por categoria, variante no carrinho, webhook Bling, pedido CRM→Bling
  - Relatório: 145 produtos, 26 com variantes, 104 variantes, 50 categorias
  - Auto-refresh 30s no frontend
  - tsconfig.json: exclui .test.ts do build (fix erro pre-existente)

- feat: dashboard Firewall/SSH na pagina Sistema
  - Backend: api/src/routes/firewall.ts — 4 endpoints (status, whitelist add/remove, unban)
  - Script: scripts/firewall-stats.sh — coleta conexoes SSH, regras UFW, Fail2ban, tentativas 24h
  - Frontend: secao Firewall em Sistema.tsx — conexoes ativas, whitelist com CRUD, IPs banidos, timeline
  - Fail2ban SSH: 1 tentativa = ban permanente (-1), ignoreip para IPs autorizados
  - Gestao via CRM: adicionar/remover IP da whitelist, desbanir — processado pelo cron do host
  - Cron: firewall-stats.sh roda a cada 1 minuto

- sec: SSH migrado para porta 60222 (porta alta)
  - /etc/ssh/sshd_config.d/05-port.conf — Port 60222
  - /etc/systemd/system/ssh.socket.d/override.conf — socket activation na porta nova
  - UFW: regras 60222 para os 3 IPs autorizados (porta 22 pendente remoção após confirmação)
  - Fail2ban: jail sshd com port 60222, maxretry 1, bantime -1 (permanente)
  - Elimina 99% dos bots que varrem porta 22

- cleanup: remove storefront v1 (porta 8000) — container órfão sem uso
  - Serviço `storefront` removido do docker-compose.yml (porta 8000)
  - Limpeza de `localhost:8000` do STORE_CORS e AUTH_CORS do Medusa
  - Container parado e removido — liberou 512MB RAM + 0.5 CPU
  - Storefront v2 (porta 8001) continua como único storefront ativo em homolog.papelariabibelo.com.br
  - Motivo: nenhum Nginx apontava para porta 8000, healthcheck falhava (307 redirect), sem tráfego

### Sessão 10/04/2026 — Dedup de templates, healthcheck frontend, disco

- **b37406e** — fix(novidades): estoque de variantes Bling (pai sempre zero, filhos têm saldo)
  - `campaigns.ts` + `public-novidades.ts`: query soma `saldo_fisico` dos filhos via subquery
  - `HAVING` ajustado para incluir produtos pai com filhos em estoque

- **f5933bc + 7ae8236** — feat(campanhas): aba Novidades com seletor manual de NF
  - Lista de NFs de entrada disponíveis para escolha manual na campanha
  - Produtos da NF selecionada com filtro de estoque e cadastro no Bling

- **2671d7a** — feat(flows): dedup de template — evita reenvio de email já enviado por campanha
  - Motor de fluxo verifica antes de cada step de email se o cliente recebeu o mesmo template nas últimas 72h
  - Cobre dois caminhos: fluxo → fluxo (`metadata.template`) e campanha → fluxo (`metadata.template_nome`)
  - `email.ts`: `sendCampaignEmails` agora registra interação em `crm.interactions` com `template_nome`
  - `flow.service.ts`: fix no caminho "template do banco" — registra campo `template` no metadata
  - Step ignorado com motivo `template_recente`, fluxo avança normalmente via `proximo`/`+1`

- **e90a7ac** — fix(frontend): adiciona HEALTHCHECK ao container
  - Último container sem healthcheck — agora todos os 7 estão `(healthy)`
  - Verifica `localhost:3000` a cada 30s, start-period 15s

- **Infra: limpeza de disco**
  - `docker builder prune -f`: 51.5 GB de build cache acumulado removidos
  - Disco: 75% → 44% (liberou ~35 GB)

---

## Sessão 09–10/04/2026 — Painel Categorias Sync + Fix Bugs Medusa Sync

### Commits desta sessão
- `749f902` feat(categorias-sync): painel de mapeamento Bling ↔ Medusa
- `68ee9c4` fix: mutex no sync Medusa + Zod nullable no medusa_handle
- `26434b8` fix(categorias-sync): auto-ignorar categorias internas do Bling no importar
- `e5203f8` style(categorias-sync): dropdown Medusa com fundo rosé + ordem alfabética
- `1a2c7a1` fix(medusa-sync): syncCategoriesToMedusa marca status='mapped' automaticamente
- Não commitado: tooltips nos botões do painel + fix lookup produtos variantes no sync

### feat: Migration 029 — Painel Categorias Sync
- Arquivo: `db/migrations/029_category_sync_panel.sql`
- Adiciona 5 colunas à `sync.bling_medusa_categories`: `status` (mapped/pending/ignored), `bling_category_name`, `created_at`, `origem`, `bling_parent_id`
- Migra 54 linhas existentes para `status='mapped'` (retrocompatibilidade)
- Cria `sync.category_sync_log` para auditoria de operações do painel

### feat: Rota `/api/categorias-sync` (4 endpoints)
- Arquivo: `api/src/routes/categorias-sync.ts`
- `GET /` — mapeamentos + stats + dropdown Medusa + último log
- `POST /importar` — importa categorias Bling via fetchCategoryMap, upsert pending. Categorias internas (TESTE, TODOS OS PRODUTOS, KIT SUBLIMAÇÃO) auto-inseridas como `ignored`
- `PUT /:blingId` — salva mapeamento manual (mapped/ignored/pending)
- `POST /sincronizar` — aplica todos os `mapped` nos produtos Medusa em background via `applyCategoryMappingToMedusa()`

### feat: Exports novos em `medusa/sync.ts`
- `getMedusaCategoriesFromMedusa()` — lista categorias Medusa para o dropdown
- `applyCategoryMappingToMedusa(mapping)` — bulk update de categorias nos produtos Medusa (REPLACE behavior)
- Fix crítico em `syncCategory()`: INSERT/ON CONFLICT agora inclui `status='mapped'`, `origem='full'`, `bling_category_name` — antes o sync automático criava a categoria no Medusa mas não marcava como `mapped` no painel

### feat: Frontend — página CategoriasSync.tsx
- Arquivo: `frontend/src/pages/CategoriasSync.tsx`
- Stats bar (total/mapped/pending/ignored com cores)
- Tabs de filtro + busca por nome de categoria
- Tabela com status badges, dropdown de categorias Medusa (fundo rosé #fff5f8, ordem alfabética pt-BR)
- Ações por linha: Mapear, Ignorar, Reativar, Alterar
- Último log da operação no rodapé
- Botão "Importar do Bling" + "Sincronizar tudo" com tooltips explicativos (title attribute)
- Rota: `/categorias-sync` — navegação em Loja Online > Categorias Sync (ícone GitMerge)

### fix: Mutex no Bling webhook → Medusa sync
- Arquivo: `api/src/integrations/bling/webhook.ts`
- Padrão "run + pending": se sync em andamento e novo webhook chega, marca `medusaSyncPending=true`
- Ao terminar o sync ativo, dispara mais 1 (e não mais) via `setImmediate`
- Antes: N webhooks em burst disparavam N syncs paralelos simultâneos
- Depois: máximo 1 sync ativo + 1 pendente acumulado

### fix: Lookup produtos variantes no Medusa sync
- Arquivo: `api/src/integrations/medusa/sync.ts`
- Bug: `medusaProducts.get(product.sku)` usava SKU do pai, mas Medusa armazena SKUs dos filhos nas variantes → 33 produtos com variantes caíam no CREATE → 400 "already exists"
- Fix: Fallback 1 — para grupos com variantes, tenta SKUs dos filhos em sequência
- Fix: Fallback 2 — se ainda não encontrado, tenta pelo handle (`toHandle(nome, sku)`)
- Mapa `medusaByHandle` construído em O(n) antes do loop principal
- Resultado esperado: 0 criados, 120+ atualizados (era 87 atualizados + 33 erros + circuit breaker)

### Fluxo automático de categorias (como funciona após a sessão)
```
Carlos salva produto no Bling com categoria
  ↓ webhook product.updated (tempo real)
  ↓ syncBlingToMedusa() em background
  ↓ syncCategoriesToMedusa() — lê staging table, zero chamadas Bling
  ↓ se categoria nova: cria no Medusa + marca status='mapped' na tabela
  ↓ produto atualizado no Medusa com a categoria correta
Painel CRM: categoria já aparece como 'mapped' — sem ação manual
```

### Diagrama das tabelas de categorias
```
sync.bling_categories          (cache das categorias do Bling ERP)
    bling_id | descricao | id_pai
    → populado pelo fetchCategoryMap() a cada sync

sync.bling_medusa_categories   (mapeamento bidirecional)
    bling_category_id | bling_category_name | medusa_category_id
    handle | bling_parent_id | status | origem | sincronizado_em
    → status: mapped | pending | ignored
    → origem: full (sync automático) | manual (painel CRM)

sync.category_sync_log         (auditoria)
    operacao | origem | usuario | detalhes | criado_em
    → operações: importar | mapear | ignorar | sincronizar
```

---

- fix: padroniza cupom de boas-vindas para BIBELO10 (10% OFF) em todos os canais
  - Footer storefront: 7% OFF → 10% OFF
  - Página política de frete: CLUBEBIBELO/7% → BIBELO10/10%
  - flow.service.ts buildLeadCartEmail: fallback CLUBEBIBELO → BIBELO10, texto 7% → 10%
  - flow.service.ts buildCouponReminderEmail: fallback CLUBEBIBELO → BIBELO10, texto 7% → 10%
  - flow.service.ts buildLeadCouponEmail: fallback CLUBEBIBELO → BIBELO10
  - flow.service.ts buildWelcomeStorefrontEmail: hardcode CLUBEBIBELO/7% → BIBELO10/10%
  - docs/claude/email-fluxos.md: documentação atualizada

---

- feat(storefront-v2): página de produto com galeria, frete e compra direta (0d5d4e6)
  - ImageGallery: thumbnails clicáveis trocam imagem principal, zoom scale-110 no hover desktop
  - FreteCalculator: input CEP com máscara, PAC + SEDEX via Melhor Envio, prazo em dias úteis
  - BuyNowButton: addItem + router.push('/checkout') sem abrir CartDrawer
  - DescriptionAccordion: <details> nativo, sem JS extra
  - Avaliações: placeholder visual 5 estrelas amarelas
  - Relacionados por categoria (product.categories[0].id), fallback genérico se sem categoria
  - WhatsApp: renomeado de "Preciso de ajuda" para "Tirar dúvidas"
  - getProductByHandle: adicionado +categories nos fields
  - API CRM: GET /api/public/frete?cep= (público, rate-limited 30/min, cache 5min)
  - Proxy Next.js: src/app/api/frete/route.ts → CRM interno (evita CORS/Cloudflare Access)
  - Arquivo: api/src/routes/public-frete.ts, storefront-v2/src/app/api/frete/route.ts
  - Componentes: ImageGallery.tsx, FreteCalculator.tsx, BuyNowButton.tsx

---

- **b4d0ecd** — feat: remove envio automático de briefing diário por email
  - Job cron `briefing-diario` (7h BRT) removido do sync.queue.ts
  - Case no worker e import de `enviarBriefingEmail` removidos
  - Briefing continua disponível na plataforma via GET /api/briefing (só dashboard, sem custo)
