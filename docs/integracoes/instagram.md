# Instagram Business — Integração com BibelôCRM

## Objetivo

Trazer KPIs orgânicos do Instagram comercial da Bibelô para o CRM, acumulando histórico indefinido no banco de dados próprio.

**Distinção importante:**
- **Meta Ads API** (já integrado) → métricas de anúncios pagos
- **Instagram Graph API** (este plano) → métricas orgânicas da conta comercial

---

## Credenciais e IDs

| Campo | Valor |
|-------|-------|
| `ig-user-id` | `17841478800595116` |
| `page-id` | `958122297382938` |
| Username | `@papelariabibelo` |
| Nome | Bibelô Papelaria Premium |
| Token | System User `Bibelo-api` — **nunca expira** |

IDs salvos em `sync.sync_state` (chaves: `instagram_user_id`, `instagram_page_id`).

---

## KPIs disponíveis via Instagram Graph API

### Conta (nível perfil)
- Seguidores — total + evolução diária
- Impressões e alcance totais
- Visitas ao perfil
- Cliques no link da bio, telefone e email

### Posts
- Curtidas, comentários, compartilhamentos, salvamentos
- Reach e impressões por post
- Engagement rate calculado
- Reels: plays + tempo médio de visualização

### Stories
- Impressões e alcance
- Saídas, respostas, toques forward/back

### Audiência dos seguidores
- Breakdown gênero × faixa etária
- Cidades e países top 45

---

## Estratégia de acúmulo histórico

A API retorna no máximo os **últimos 30 dias** de dados por consulta.
O CRM fará sync diário com janela de **2 dias** (overlap para não perder nada).
Dados são salvos em tabelas próprias via UPSERT — nunca deletados.

**Resultado:** a partir do dia que conectar, o histórico cresce indefinidamente.
Em 6 meses: 180 dias de evolução de seguidores, sazonalidade de engajamento, comparação de posts — dados que o próprio app do Instagram não oferece.

---

## Permissões no token Meta (System User Bibelo-api)

| Permissão | Status |
|-----------|--------|
| `pages_show_list` | ✅ |
| `pages_read_engagement` | ✅ |
| `ads_read` | ✅ |
| `ads_management` | ✅ |
| `instagram_basic` | ✅ adicionado em 11/04/2026 |
| `instagram_manage_insights` | ✅ adicionado em 11/04/2026 |

---

## Arquitetura técnica

### Backend
| Arquivo | Função |
|---------|--------|
| `api/src/integrations/meta/instagram.ts` | Client Instagram Graph API |
| `api/src/routes/instagram.ts` | Endpoints autenticados |

### Job BullMQ
- Nome: `instagram-sync`
- Frequência: 1x por dia às 07:00
- Janela: últimos 2 dias (overlap)
- Tabelas de destino: UPSERT por data

### Tabelas (schema `marketing`)
| Tabela | Conteúdo |
|--------|----------|
| `instagram_insights_daily` | Métricas da conta por dia (impressões, alcance, seguidores, visitas) |
| `instagram_posts` | Posts com métricas (likes, comments, saves, shares, reach, engagement_rate) |
| `instagram_audience` | Snapshot semanal de audiência (gênero/idade, cidades) |

### Endpoints
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/instagram/status` | Status conexão + seguidores atuais |
| GET | `/api/instagram/overview?periodo=30d` | KPIs conta + evolução diária |
| GET | `/api/instagram/posts?periodo=30d` | Posts com métricas |
| GET | `/api/instagram/audience` | Breakdown audiência |
| POST | `/api/instagram/sync` | Sync manual |
| GET | `/api/instagram/sync-status` | Último sync + total registros |

---

## Mapa das rotas Instagram Graph API

### Métricas diárias da conta
```
GET /{ig-user-id}/insights
  ?metric=impressions,reach,profile_views,follower_count,
          email_contacts,website_clicks,phone_call_clicks
  &period=day
  &since=UNIX_TIMESTAMP
  &until=UNIX_TIMESTAMP
```

### Posts
```
GET /{ig-user-id}/media
  ?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count

GET /{ig-media-id}/insights
  ?metric=impressions,reach,saved,shares,video_views (+ reels: ig_reels_avg_watch_time)
```

### Audiência (lifetime snapshot)
```
GET /{ig-user-id}/insights
  ?metric=audience_gender_age,audience_city,audience_country
  &period=lifetime
```

---

## Status

| Etapa | Status |
|-------|--------|
| Levantamento KPIs disponíveis | ✅ Concluído |
| Arquitetura definida | ✅ Concluído |
| Permissões no token Meta | ✅ Concluído em 11/04/2026 |
| IDs salvos no banco | ✅ ig-user-id: 17841478800595116 |
| Migration 031_instagram.sql | ✅ Implementado |
| Backend client + rotas | ✅ Implementado |
| Job BullMQ diário 07:00 | ✅ Implementado |
| Frontend Instagram.tsx | ✅ Implementado |

---

*Criado em: 10 de Abril de 2026*
*Atualizado em: 11 de Abril de 2026 — token configurado, IDs descobertos, implementação completa*
