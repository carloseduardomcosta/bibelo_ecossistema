# Instagram Business — Integração com BibelôCRM

## Objetivo

Trazer KPIs orgânicos do Instagram comercial da Bibelô para o CRM, acumulando histórico indefinido no banco de dados próprio.

**Distinção importante:**
- **Meta Ads API** (já integrado) → métricas de anúncios pagos
- **Instagram Graph API** (este plano) → métricas orgânicas da conta comercial

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

## Pré-requisitos

### Conta Instagram
- Deve ser conta Business ou Creator (não pessoal)
- Deve estar conectada a uma Página do Facebook

### Permissões no token Meta (System User)
O token atual (`META_ACCESS_TOKEN`) já tem:
- `pages_show_list` ✅
- `pages_read_engagement` ✅
- `ads_read` ✅
- `ads_management` ✅

**Faltam apenas estas duas:**
- `instagram_basic` ❌
- `instagram_manage_insights` ❌

### Como adicionar as permissões
1. Acessar `https://business.facebook.com/settings/system-users`
2. Clicar no System User **BibeloCRM-API**
3. Clicar em **"Gerar token"**
4. Selecionar o app **BibelôCRM**
5. Marcar TODAS as permissões (incluindo as já existentes + as duas novas)
6. Copiar o novo token e atualizar `META_ACCESS_TOKEN` no `.env`

---

## Arquitetura técnica planejada

### Backend
| Arquivo | Função |
|---------|--------|
| `api/src/integrations/meta/instagram.ts` | Client Instagram Graph API |
| `api/src/routes/instagram.ts` | Endpoints autenticados |

### Job BullMQ
- Nome: `instagram-sync`
- Frequência: 1x por dia (ex: 06:00)
- Janela: últimos 2 dias (overlap)
- Tabelas de destino: UPSERT por data

### Tabelas (schema `marketing`)
| Tabela | Conteúdo |
|--------|----------|
| `instagram_insights_daily` | Métricas da conta por dia (impressões, alcance, seguidores, visitas) |
| `instagram_posts` | Posts com métricas (likes, comments, saves, shares, reach, engagement_rate) |
| `instagram_audience` | Snapshot semanal de audiência (gênero/idade, cidades) |

### Endpoints planejados
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/instagram/overview?periodo=30d` | KPIs conta + evolução seguidores |
| GET | `/api/instagram/posts?periodo=30d` | Posts com métricas |
| GET | `/api/instagram/audience` | Breakdown audiência |
| POST | `/api/instagram/sync` | Sync manual |

### Frontend
Nova página **"Instagram"** no menu Marketing (ao lado de Meta Ads).

---

## Fluxo de autenticação (uma vez só)

```
GET /me/accounts                            → lista Páginas Facebook
GET /{page-id}?fields=instagram_business_account → retorna ig-user-id
GET /{ig-user-id}?fields=name,followers_count   → confirma conexão
```

O `ig-user-id` fica salvo em `sync.sync_state` (chave: `instagram_user_id`).

---

## Status

| Etapa | Status |
|-------|--------|
| Levantamento KPIs disponíveis | ✅ Concluído |
| Arquitetura definida | ✅ Concluído |
| Permissões no token Meta | ⏳ Pendente — Carlos adiciona `instagram_basic` + `instagram_manage_insights` |
| Implementação backend + tabelas | 📋 Aguardando token |
| Implementação frontend | 📋 Aguardando token |

---

*Criado em: 10 de Abril de 2026*
