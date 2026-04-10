# Integrações externas

## Bling ERP v3
- Docs: `docs/integracoes/bling-openapi.json` + `docs/integracoes/bling-referencia.md`
- OAuth2 tokens em `sync.sync_state`. Sync incremental 30min via BullMQ.
- **Rate limit: 3 req/s** — delay 350ms, retry em 429
- Lista de produtos NÃO traz categoria. Lista de pedidos NÃO traz itens. Estoques EXIGE `idsProdutos[]` (lotes de 50).
- Webhook HMAC: `X-Bling-Signature-256: sha256=<hash>` com client_secret
- **Otimização sync incremental**: ~110 req/ciclo → ~30 req/ciclo
  - Categorias: cache em memória por 6h (`categoryCache`)
  - `syncProductCategories`: só roda no full sync (`/api/sync?tipo=full`) — eliminado do incremental (-57 chamadas/ciclo)
  - Contas a pagar: filtra `situacao=1` (em aberto) + pula detalhe sem mudança
  - Contatos: try/catch individual — 1 erro não para os demais

## NuvemShop
- OAuth2: token nunca expira — app_id `26424`, store `7290881`
- Header: `Authentication: bearer` (NÃO `Authorization`)
- **Rate limit: 2 req/s** (burst 40, leaky bucket)
- 9 webhooks em `webhook.papelariabibelo.com.br`
- HMAC: `x-linkedstore-hmac-sha256` com `client_secret`
- Customer API: criação de conta com senha temporária (BibXXXXX!), link recuperação de senha
- Coupons API: gerarCupomUnico() cria cupons descartáveis (max_uses:1, first_consumer_purchase:true)

## Amazon SES v2 (e-mail — provider primário)
- Região: **sa-east-1** (São Paulo). Custo: $0,10 por 1.000 emails
- DKIM verificado, Configuration Set `bibelocrm-tracking`
- Conta AWS: `350823026867`, IAM user: `bibelocrm-ses`
- **Dual provider**: `EMAIL_PROVIDER=ses|resend` no `.env`
- **Webhook SNS**: `POST /api/webhooks/ses` — confirma subscription automaticamente, processa open/click/bounce/complaint
- **Dashboard de consumo**: `/consumo-email` no frontend
- SDK: `@aws-sdk/client-sesv2` — client em `api/src/integrations/ses/client.ts`

## Resend (e-mail — fallback)
- Plano grátis: 3.000/mês. Remetente: `Papelaria Bibelô <marketing@papelariabibelo.com.br>`
- **Webhook**: `POST /api/webhooks/resend` — Svix HMAC, registra em `marketing.email_events`
- Spam complaint → opt-out automático (LGPD)
- **Proxy de imagens**: `/api/email/img/:hash` — cacheia imagens NuvemShop (cache 30d)
- **Redirect WhatsApp**: `/api/email/wa` — evita wa.me direto nos emails (spam filter)

## Meta Ads (Facebook + Instagram)
- **API**: Meta Graph API v21.0 (Marketing API)
- **Rota**: `api/src/routes/meta-ads.ts` — 6 endpoints (status, overview, campaigns, demographics, geographic, platforms)
- **Frontend**: `frontend/src/pages/MetaAds.tsx`
- **Auth**: System User Token (sem expiração) ou Long-lived User Token (60 dias)
- **Cache**: 5 min in-memory
- **Variáveis .env**: `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`
- Docs: `docs/integracoes/meta-ads.md`
- Fases: 1) Dashboard ✅ | 2) Sync audiences CRM→Meta 🔜 | 3) Criação campanhas 📋

## Chatwoot + Meta Cloud API (WhatsApp + Instagram) — planejado
- Plano completo: `docs/integracoes/whatsapp-chatwoot.md`
- Chatwoot self-hosted em chat.papelariabibelo.com.br
- WhatsApp via Meta Cloud API oficial (sem risco de ban)
- Instagram DM via Instagram Messaging API
- Custo estimado: ~R$ 105/mês (mensagens Meta)

## Monitoramento — Uptime Kuma
- URL: https://status.papelariabibelo.com.br — DNS Cloudflare → 187.77.254.241
- Nginx: `/etc/nginx/sites-enabled/status` → reverse proxy localhost:3001
- **11 monitores**: API, Frontend, Medusa, Storefront, PostgreSQL, Redis + 5 externos
- **2 canais de alerta** via Resend SMTP: carloseduardocostatj@gmail.com + contato@papelariabibelo.com.br
