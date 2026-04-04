# Meta Ads — Integração com BibelôCRM

## Visão e Objetivo

**Objetivo principal: VENDER.** Atrair o público feminino do Brasil (foco Sul e Sudeste) para a Papelaria Bibelô através de campanhas inteligentes no Facebook e Instagram, com dados em tempo real no CRM.

### O que a integração faz
- **Dashboard completo** no CRM com KPIs de performance (gasto, impressões, cliques, CTR, CPC, ROAS, conversões)
- **Análise demográfica** — ver exatamente qual faixa etária e gênero responde melhor
- **Análise geográfica** — ver quais estados/regiões do Sul e Sudeste convertem mais
- **Performance por plataforma** — Facebook vs Instagram vs Stories vs Reels
- **Tendência diária** — acompanhar evolução dos investimentos e resultados
- **Visão por campanha** — comparar performance entre campanhas ativas

### Fases planejadas
| Fase | Funcionalidade | Status |
|------|---------------|--------|
| 1 | Dashboard de Insights (leitura) | ✅ Implementado |
| 2 | Sync de Públicos CRM → Meta (Custom Audiences) | 🔜 Próximo |
| 3 | Criação de campanhas pelo CRM | 📋 Planejado |

---

## Passo a passo — O que o Carlos precisa fazer

### 1. Criar App no Meta Developer Portal

1. Acesse **[developers.facebook.com](https://developers.facebook.com/)**
2. Faça login com sua conta do Facebook (a mesma que gerencia a página da Bibelô)
3. Clique em **"Meus Apps"** → **"Criar App"**
4. Selecione **"Outro"** como tipo de app
5. Nome do app: `BibelôCRM`
6. Email de contato: `carloseduardocostatj@gmail.com`
7. Clique em **"Criar App"**

### 2. Adicionar produto Marketing API

1. No painel do app, vá em **"Adicionar Produtos"**
2. Encontre **"Marketing API"** e clique em **"Configurar"**
3. Pronto — isso libera os endpoints de insights

### 3. Obter o Ad Account ID

1. Acesse o **[Gerenciador de Anúncios](https://www.facebook.com/adsmanager)**
2. Na URL, o número após `act=` é seu Ad Account ID
   - Exemplo: `https://www.facebook.com/adsmanager/manage/campaigns?act=123456789`
   - O ID seria: `123456789`
3. Ou vá em **Configurações da conta** → o ID aparece em "ID da conta de anúncios"

### 4. Gerar System User Token (recomendado) ou User Token

#### Opção A — System User Token (sem expiração, ideal)

1. Acesse o **[Meta Business Suite](https://business.facebook.com/)**
2. Vá em **Configurações do negócio** → **Usuários** → **Usuários do sistema**
3. Clique em **"Adicionar"**
4. Nome: `BibeloCRM-API`, Função: **Admin**
5. Clique em **"Gerar token"**
6. Selecione o app `BibelôCRM`
7. Marque as permissões: **`ads_read`** e **`ads_management`**
8. Clique em **"Gerar token"**
9. **COPIE O TOKEN** — ele só aparece uma vez!

#### Opção B — User Token de longa duração (60 dias)

1. No app em developers.facebook.com, vá em **Ferramentas** → **Graph API Explorer**
2. Selecione seu app
3. Adicione permissões: `ads_read`, `ads_management`
4. Clique em **"Gerar Token de Acesso"**
5. Autorize o app
6. O token de curta duração (1h) aparece — use a ferramenta para trocar por um de longa duração (60 dias)

### 5. Configurar no BibelôCRM

Adicionar no arquivo `.env` do servidor:

```env
# ── Meta Ads (Facebook + Instagram)
META_ACCESS_TOKEN=SEU_TOKEN_AQUI
META_AD_ACCOUNT_ID=123456789
```

Depois rebuild da API:
```bash
docker compose up -d --build api
```

### 6. Acessar o Dashboard

No CRM, menu **Marketing** → **Meta Ads** 🎉

---

## Arquitetura técnica

### Backend
| Arquivo | Função |
|---------|--------|
| `api/src/integrations/meta/client.ts` | Client Meta Graph API (axios, cache 5min, retry em 429) |
| `api/src/routes/meta-ads.ts` | 6 endpoints protegidos com authMiddleware |

### Frontend
| Arquivo | Função |
|---------|--------|
| `frontend/src/pages/MetaAds.tsx` | Dashboard completo com KPIs, gráficos, tabelas |

### Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/meta-ads/status` | Status da conexão + dados da conta |
| GET | `/api/meta-ads/overview?periodo=7d` | KPIs agregados + dados diários |
| GET | `/api/meta-ads/campaigns?periodo=7d` | Campanhas com insights individuais |
| GET | `/api/meta-ads/demographics?periodo=7d` | Breakdown por idade + gênero |
| GET | `/api/meta-ads/geographic?periodo=7d` | Breakdown por região/estado |
| GET | `/api/meta-ads/platforms?periodo=7d` | Breakdown por plataforma (FB/IG) |

### Meta Graph API v21.0

- Base URL: `https://graph.facebook.com/v21.0/`
- Auth: `access_token` como query parameter
- Rate limit: 9.000 pontos por janela rolante (Standard Access)
- Cache: 5 minutos in-memory para evitar chamadas desnecessárias
- Retry automático em erro 429 (rate limit) com backoff

### Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `META_ACCESS_TOKEN` | Token de acesso (System User ou Long-lived) |
| `META_AD_ACCOUNT_ID` | ID da conta de anúncios (sem prefixo act_) |

---

## Métricas disponíveis no dashboard

### KPIs principais
- **Investimento** (spend) — quanto foi gasto no período
- **Impressões** — quantas vezes os anúncios foram exibidos
- **Alcance** (reach) — pessoas únicas que viram os anúncios
- **Cliques** — cliques totais nos anúncios
- **CTR** (Click-Through Rate) — taxa de cliques (%)
- **CPC** (Custo por Clique) — quanto custa cada clique
- **CPM** (Custo por Mil Impressões) — eficiência de entrega
- **Conversões** — compras, carrinho, checkout, leads
- **ROAS** — retorno sobre investimento em anúncios

### Breakdowns
- **Demográfico**: idade (18-24, 25-34, 35-44, 45-54, 55-64, 65+) × gênero (feminino/masculino)
- **Geográfico**: por estado brasileiro (foco Sul/Sudeste)
- **Plataforma**: Facebook, Instagram, Audience Network, Messenger
- **Posicionamento**: Feed, Stories, Reels, Explorar

---

## Estratégia de campanhas — Público feminino Sul/Sudeste

### Insights para usar no dashboard
1. **Demográfico** → verificar qual faixa etária feminina tem melhor CTR e menor CPC
2. **Geográfico** → identificar os estados campeões (SP, PR, SC, RS, MG, RJ) e alocar mais budget
3. **Plataforma** → Instagram Stories/Reels tendem a performar melhor com público feminino jovem
4. **ROAS** → focar budget nas campanhas com melhor retorno sobre investimento
5. **Horário** → analisar quando o público feminino mais engaja (futuro: breakdown por hora)

### Próximos passos (Fase 2 — Audiences)
- Exportar segmento "Clientes VIP mulheres Sul/Sudeste" como Custom Audience
- Criar Lookalike Audience a partir das melhores clientes
- Retargeting de visitantes do site que não compraram

---

*Criado em: 4 de Abril de 2026*
*Última atualização: 4 de Abril de 2026*
