# Status das Integrações — BibelôCRM

Última atualização: 31 de Março de 2026

| Integração | Status | Observações |
|-----------|--------|-------------|
| PostgreSQL | ✅ produção | 25 tabelas, 4 schemas (crm, marketing, sync, financeiro) |
| Redis | ✅ produção | cache + filas BullMQ |
| Nginx + SSL | ✅ produção | crm.papelariabibelo.com.br |
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
| Motor de Fluxos | ✅ produção | 10 fluxos ativos, BullMQ process-steps 1min, check-abandoned 5min, check-interest 15min |
| Carrinho Abandonado | ✅ produção | detecta order/created sem paid após 2h, recovery_url real do checkout |
| Avaliação Pós-Entrega | ✅ produção | webhook order/fulfilled → email 12h após entrega |
| Caça-Leads (Popup) | ✅ produção | popup JS via GTM, captura email+WhatsApp, verificação email obrigatória |
| Opt-out Email (LGPD) | ✅ produção | descadastro 1-click, campanhas e fluxos respeitam opt-out |
| Evolution WhatsApp | ⏳ pendente | aguardando configuração |
| Tracking Comportamental | ✅ produção | page_view, product_view, add_to_cart, search, checkout — script JS via GTM |
| Geolocalização | ✅ produção | geoip-lite (MaxMind offline), IP real → cidade/estado/país |
| Score de Leads | ✅ produção | engajamento (popup +15, views +3, cart +10, emails +3) |
| UTM Tracking | ✅ produção | captura utm_source/medium/campaign, persiste cookie 30d |
| Página de Links | ✅ produção | menu.papelariabibelo.com.br — substitui Linktree |
| Segurança (Pentest) | ✅ produção | 15 fixes: SQL injection, CSRF, XSS, HMAC, CSP/HSTS |
| Testes Automatizados | ✅ produção | Vitest + Supertest, 30 testes integração |
| Google Reviews | ✅ produção | Places API (New), cache DB 6h, widget JS NuvemShop via GTM |
| Inteligência de Fluxos | ✅ produção | pula step cupom se lead já comprou, reativação só com pedido |
| Uptime Kuma | ⏳ pendente | container não subiu ainda |
