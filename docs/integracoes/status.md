# Status das Integrações — BibelôCRM

Última atualização: 22 de Abril de 2026

| Integração | Status | Observações |
|-----------|--------|-------------|
| PostgreSQL | ✅ produção | 25 tabelas, 4 schemas (crm, marketing, sync, financeiro) |
| Redis | ✅ produção | cache + filas BullMQ |
| Nginx + SSL | ✅ produção | crm.papelariabibelo.com.br, api.papelariabibelo.com.br (SSL até 2026-06-30) |
| API Node.js | ✅ produção | /health respondendo |
| Google OAuth2 | ✅ produção | login exclusivo via Google Sign-In |
| Módulo Financeiro | ✅ produção | fluxo de caixa, despesas fixas, simulador, embalagens |
| Frontend React | 🔧 em desenvolvimento | login, dashboard, clientes, financeiro, simulador, automações/leads/fluxos |
| GitHub Actions | ✅ configurado | deploy automático no push |
| Bling OAuth2 | ✅ configurado | credenciais no .env, callback funcional |
| Bling Sync | ✅ produção | sync manual + incremental 30min + contas a pagar via BullMQ |
| Bling Webhooks | ✅ produção | webhook.papelariabibelo.com.br — pedidos, estoque, produtos, NFs, fornecedores |
| Relatórios Financeiros | ✅ produção | DRE, Fluxo Projetado, Comparativo Mensal |
| NuvemShop OAuth2 | ✅ produção | app_id 26424, store_id 7290881, token salvo, nunca expira |
| NuvemShop Sync | ✅ produção | clientes, pedidos, produtos — sync manual + webhooks real-time |
| NuvemShop Webhooks | ✅ produção | 9 webhooks — order/created,updated,paid,fulfilled,cancelled + customer/* + product/* |
| Resend E-mail | ✅ produção | remetente "Papelaria Bibelô", 14 templates, domínio verificado |
| Amazon SES | ⏳ sandbox | sa-east-1, DKIM verificado, dual provider (SES/Resend), dashboard consumo, aguardando produção |
| Motor de Fluxos | ✅ produção | 10 fluxos ativos, BullMQ process-steps 1min, check-abandoned 5min, check-interest 15min |
| Carrinho Abandonado | ✅ produção | detecta order/created sem paid após 2h, recovery_url real do checkout |
| Avaliação Pós-Entrega | ✅ produção | webhook order/fulfilled → email 12h após entrega |
| Caça-Leads (Popup) | ✅ produção | popup JS via GTM, captura email+WhatsApp, verificação email obrigatória |
| Opt-out Email (LGPD) | ✅ produção | descadastro 1-click, campanhas e fluxos respeitam opt-out |
| Chatwoot (multi-canal) | 📋 planejado | WhatsApp + Instagram DM via Meta Cloud API oficial — docs/integracoes/whatsapp-chatwoot.md |
| Evolution API (Clube VIP) | ✅ produção | v2.2.3, porta 8080, webhook GROUP_PARTICIPANTS_UPDATE → vincula membro ao CRM (whatsapp_jid), cria customer se novo. Somente leitura — sem envio de mensagens |
| WAHA Grupo VIP | ✅ produção | Engine NOWEB, porta 3030. P0: sync inicial via `POST /api/sync/waha/vip` (6 VIP + 36 não-VIP de 135 membros). P1: webhook real-time `group.v2.participants` → atualiza `vip_grupo_wp` + `vip_grupo_wp_em` em `crm.customers`. HMAC-SHA512. Cron semanal seg 08h. 16 testes automatizados. |
| Infra Dashboard | ✅ produção | http://10.0.111.7:8888 (WireGuard only). Cards clicáveis para todos os serviços com health check real. Auto-refresh 60s. |
| WireGuard Access Control | ✅ produção | status, homolog e Medusa Admin (/app) restritos à rede WireGuard (10.0.111.0/28) via nginx allow/deny + AdGuard DNS split-horizon. |
| Meta Ads Dashboard | ✅ produção | Graph API v25.0, 6 endpoints insights + 7 históricos, BullMQ sync 6h, migration 050 |
| Meta Custom Audiences | ✅ produção | TOS aceitos 17/04/2026, 4 segmentos (Clientes 8, Leads 13, Inativos 4, Recentes 4), sync diário 03:00 BRT, endpoint manual POST /api/meta-ads/audiences/sync |
| Tracking Comportamental | ✅ produção | page_view, product_view, add_to_cart, search, checkout — script JS via GTM |
| Geolocalização | ✅ produção | geoip-lite (MaxMind offline), IP real → cidade/estado/país |
| Score de Leads | ✅ produção | engajamento (popup +15, views +3, cart +10, emails +3) |
| UTM Tracking | ✅ produção | captura utm_source/medium/campaign, persiste cookie 30d |
| Página de Links | ✅ produção | boasvindas.papelariabibelo.com.br — substitui Linktree |
| Segurança (Pentest) | ✅ produção | 15 fixes: SQL injection, CSRF, XSS, HMAC, CSP/HSTS + hardening VPS/Nginx 09/04 |
| Testes Automatizados | ✅ produção | Vitest + Supertest, 30 testes integração |
| Google Reviews | ✅ produção | Places API (New), cache DB 6h, widget JS NuvemShop via GTM |
| Inteligência de Fluxos | ✅ produção | pula step cupom se lead já comprou, reativação só com pedido |
| Medusa.js v2 | ✅ produção | porta 9000, Admin Dashboard ativo, 373 produtos sincronizados do Bling, Pix integrado |
| Sync Bling → Medusa | ✅ produção | CRM como hub: sync.bling_products → Medusa Admin API, BullMQ 30min, dedup SKU+handle (fallback), estoque → published/draft. Fix 10/04: fallback handle p/ produtos sem SKU na variante |
| Categorias Sync (painel) | ✅ produção | Painel CRM Loja Online → Categorias Sync. 4 rotas `/api/categorias-sync`. Fluxo automático: webhook product.* → syncCategoriesToMedusa() → cria+marca mapped. Manual: importar/mapear/sincronizar. 54 categorias mapeadas. |
| Next.js Storefront | 🔧 em desenvolvimento | porta 8001, integrado com Medusa.js v2. Páginas: /produtos, /produto/[handle], /novidades. Homepage: +BrandsSection (6 marcas filtráveis) + InstagramPlaceholder |
| Mercado Pago Pix | ✅ produção | Payment provider Medusa v2 — API Orders (Checkout Transparente), webhook HMAC validado, Nginx+SSL em api.papelariabibelo.com.br |
| Melhor Envio | ✅ produção | OAuth2 conectado, fulfillment provider Medusa v2, PAC+SEDEX calculados via API, token via CRM |
| Medusa → Bling pedidos | ✅ produção | Subscriber order.placed → CRM → Bling API (busca/cria contato + cria pedido), webhook bidirecional confirmado |
| Melhor Envio etiquetas | ✅ produção | Geração automática via CRM para pedidos Medusa (cart→checkout→generate→print), NuvemShop mantém fluxo Bling |
| Portal de Rastreio | ✅ produção (PoC) | `GET /api/public/rastreio?codigo=` — sync via Bling API `GET /logisticas/objetos/{id}`, tabela `sync.logistica_objetos`, widget `TrackingWidget` reutilizável. Sync manual: `POST /api/sync/bling/logistica`. |
| Uptime Kuma | ✅ produção | status.papelariabibelo.com.br — 11 monitores, 2 canais alerta |
| Monitoramento VPS | ✅ produção | página /sistema no CRM: disco, RAM, containers, SSL, código, alertas (cron 1min + auto-refresh 30s) |
| Edrone | ❌ removido | DNS Cloudflare limpo em 09/04/2026 — 5 registros removidos (DKIM, mail, click, sms, sparkpost) |
