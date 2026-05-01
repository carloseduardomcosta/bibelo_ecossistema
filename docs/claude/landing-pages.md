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

---

## Menu Boas-Vindas (boasvindas.papelariabibelo.com.br)

Página de links do Instagram/bio — separada do sistema de LPs.

### Estrutura (01/05/2026)
- Banner WhatsApp verde em destaque (SVG oficial + animação pulse)
- Cards: Clube VIP, Novidades (formulário)
- Parcerias B2B: **removido** (NuvemShop sendo descontinuada em 12/05/2026)
- Loja On-line: **removido** (idem)

### Tracking
- Cada clique em link → `marketing.link_clicks` (slug, ip, geo, user_agent, referer)
- Page view (abertura da página) → `marketing.link_clicks` slug=`page_view` via pixel GET `/api/links/pageview`
- Dashboard no CRM: Marketing → Menu Boas-Vindas (`/menu-boasvindas`)
  - Total views, cliques, CTR · gráfico por dia · top estados · origem tráfego · horário de pico

### Endpoints
- `GET /api/links/pageview` — público, registra page view (204)
- `GET /api/links/stats` — protegido, retorna resumo completo (views, CTR, por link, por dia, por estado, referers, horas)
- `GET /api/links/page` — HTML da página pública
- `GET /api/links/go/:slug` — redirect com tracking

### Virada DNS automática — 11/05/2026
- Cron `1 3 11 5 *` → `/opt/bibelocrm/scripts/flip-dns-bibelo.sh`
- Atualiza A records `papelariabibelo.com.br` para `187.77.254.241` via Cloudflare API
- Nginx `/etc/nginx/sites-enabled/papelariabibelo` → redirect 301 para boasvindas
- Cert SSL já obtido: `/etc/letsencrypt/live/papelariabibelo.com.br/` (válido até 30/07/2026)
- Log da virada: `/var/log/flip-dns-bibelo.log`
