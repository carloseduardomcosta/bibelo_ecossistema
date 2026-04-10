# Landing Pages para Campanhas

Páginas de captura dedicadas para ads (Instagram/Facebook). Sem distrações, focadas em conversão.

## Fluxo: Ad → Landing Page → Lead → Loja
1. Ad direciona para `webhook.papelariabibelo.com.br/lp/{slug}`
2. Página renderiza HTML standalone (sem React, sem auth)
3. Vitrine dinâmica: puxa 6 produtos da última NF entrada com validação NuvemShop API (imagem + link + preço > 0)
4. Form captura nome + email → `/api/leads/capture` (popup_id: `lp_{slug}`)
5. Após captura, redirect automático para a loja

## Landing Pages ativas
- `/lp/novidades` — últimos lançamentos
- `/lp/canetas` — canetas premium
- `/lp/marca-texto` — marca-textos coloridos
- `/lp/agendas` — agendas e planners
- `/lp/presentes` — kits e presentes
- `/lp/dia-das-maes` — campanha sazonal

## Arquivos
- Backend: `api/src/routes/landing-pages.ts` — CRUD admin + página pública + tracking
- Frontend: `frontend/src/pages/LandingPages.tsx` — gerenciamento com KPIs
- Migration: `db/migrations/026_landing_pages.sql`
- Nginx: `/etc/nginx/sites-enabled/webhook` — location `/lp/` e `/api/landing-pages/track/`
- Dados: `marketing.landing_pages` — slug, título, cores, cupom, UTMs, visitas, capturas
