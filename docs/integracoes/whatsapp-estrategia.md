# WhatsApp Business API — Estratégia Completa para Papelaria Bibelô

> Documento de referência para integração do WhatsApp ao BibelôCRM.
> Última atualização: 30 de Março de 2026

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Por que Meta Cloud API](#2-por-que-meta-cloud-api)
3. [Setup inicial — passo a passo](#3-setup-inicial--passo-a-passo)
4. [Arquitetura técnica](#4-arquitetura-técnica)
5. [Templates de mensagem (aprovação Meta)](#5-templates-de-mensagem-aprovação-meta)
6. [Fluxos automáticos — email + WhatsApp](#6-fluxos-automáticos--email--whatsapp)
7. [Grupo VIP — estratégia com 115 membros](#7-grupo-vip--estratégia-com-115-membros)
8. [Catálogo do WhatsApp Business](#8-catálogo-do-whatsapp-business)
9. [Campanhas manuais via CRM](#9-campanhas-manuais-via-crm)
10. [Métricas e tracking](#10-métricas-e-tracking)
11. [Custos e limites](#11-custos-e-limites)
12. [Roadmap de implementação](#12-roadmap-de-implementação)

---

## 1. Visão geral

O WhatsApp é o canal com maior taxa de abertura no Brasil (~98%) e a Papelaria Bibelô já tem presença ativa:

| Ativo atual | Status |
|-------------|--------|
| WhatsApp Business | Ativo, número (47) 9 3386-2514 |
| Catálogo de produtos | Configurado na loja |
| Grupo VIP | 115 membros ativos |
| Instagram → WhatsApp | Fluxo de atendimento existente |

**O objetivo:** Integrar o WhatsApp como canal de automação no BibelôCRM, trabalhando junto com email nos fluxos que já existem (carrinho abandonado, pós-compra, reativação, etc.).

### O que muda com a integração

| Hoje (só email) | Com WhatsApp integrado |
|------------------|----------------------|
| Carrinho abandonado → email 2h depois | Carrinho abandonado → WhatsApp 1h + email 4h |
| Pós-compra → email 24h depois | Pós-compra → WhatsApp 2h (agradecimento) + email 3 dias (avaliação) |
| Lead capturado → email boas-vindas | Lead capturado → WhatsApp instantâneo com cupom |
| Reativação → email após 45 dias | Reativação → WhatsApp 30d + email 45d |
| Grupo VIP → manual | Grupo VIP → novidades automáticas via CRM |

**Estimativa de impacto:**
- Carrinho abandonado: taxa de recuperação sobe de ~5% (email) para ~15-20% (WhatsApp + email)
- Pós-compra: taxa de avaliação sobe de ~3% (email) para ~12% (WhatsApp direto)
- Reativação: churn reduz ao abordar 15 dias antes via WhatsApp

---

## 2. Por que Meta Cloud API

| Critério | Evolution API (descartada) | Meta Cloud API (escolhida) |
|----------|---------------------------|---------------------------|
| Risco de ban | Alto (protocolo não-oficial) | Zero (API oficial) |
| Templates aprovados | Não precisa | Sim, aprovação 24-48h |
| Botões interativos | Limitado | Sim (CTA, Quick Reply) |
| Catálogo | Não | Sim (product messages) |
| Custo | Grátis (mas risco) | 1.000 conversas/mês grátis |
| Métricas | Básicas | delivered, read, replied |
| Escalabilidade | Instável | Ilimitada |

**Decisão final:** Meta Cloud API. O número da Bibelô é o ativo mais valioso — não pode correr risco de ban.

---

## 3. Setup inicial — passo a passo

### Pré-requisitos

- [x] Meta Business Account (já tem — Facebook Pixel 1380166206444041)
- [ ] Meta Business verificado (documentos CNPJ 63.961.764/0001-63)
- [ ] App no Meta for Developers
- [ ] Número (47) 9 3386-2514 registrado na API
- [ ] Templates aprovados pela Meta

### Passo 1: Criar App no Meta for Developers

1. Acessar [developers.facebook.com](https://developers.facebook.com)
2. **Criar App** → tipo "Business" → conectar ao Meta Business Account da Bibelô
3. No painel do app, adicionar o produto **"WhatsApp"**
4. Gerar **token permanente** (System User token com permissão `whatsapp_business_messaging`)

### Passo 2: Registrar o número

1. No painel WhatsApp do app, ir em **"Começar"**
2. Adicionar número de telefone: **(47) 9 3386-2514**
3. Verificar via SMS ou ligação
4. O número já pode enviar mensagens via API

> **Importante:** Ao migrar para a API, o app WhatsApp Business normal do celular para de funcionar nesse número. A Meta oferece o WhatsApp Business **App** ou a **API** — não dá pra usar os dois no mesmo número. Alternativa: usar um segundo número só para a API e manter o principal no celular.

### Passo 3: Configurar no BibelôCRM

Adicionar ao `.env`:
```env
# WhatsApp — Meta Cloud API
WHATSAPP_TOKEN=EAAxxxxxxx           # System User token
WHATSAPP_PHONE_ID=123456789012345   # Phone Number ID (não é o número, é o ID no Meta)
WHATSAPP_BUSINESS_ID=987654321      # WhatsApp Business Account ID
WHATSAPP_VERIFY_TOKEN=bibelo_wh_2026  # Token para webhook de status
```

### Passo 4: Configurar webhook de status

A Meta envia callbacks de entrega (sent, delivered, read, failed):

- URL: `https://webhook.papelariabibelo.com.br/api/webhooks/whatsapp`
- Verify Token: `bibelo_wh_2026` (definido no .env)
- Campos: `messages`, `messaging_handovers`

---

## 4. Arquitetura técnica

### Fluxo de envio

```
BibelôCRM (flow.service.ts)
    │
    ├── step.tipo === 'email'
    │   └── Resend API → email do cliente
    │
    └── step.tipo === 'whatsapp'
        └── Meta Cloud API → WhatsApp do cliente
            │
            POST https://graph.facebook.com/v21.0/{PHONE_ID}/messages
            Authorization: Bearer {WHATSAPP_TOKEN}
            Content-Type: application/json
            │
            Body: {
              messaging_product: "whatsapp",
              to: "5547933862514",          ← número do cliente (E.164)
              type: "template",
              template: {
                name: "carrinho_abandonado", ← template aprovado
                language: { code: "pt_BR" },
                components: [
                  { type: "body", parameters: [...] },
                  { type: "button", ... }
                ]
              }
            }
```

### Fluxo de recebimento (webhook)

```
Cliente responde no WhatsApp
    ↓
Meta Cloud API → POST webhook.papelariabibelo.com.br/api/webhooks/whatsapp
    ↓
BibelôCRM processa:
    ├── Salva em crm.interactions (tipo='whatsapp_recebido')
    ├── Atualiza timeline do cliente
    ├── Verifica se é resposta a fluxo ativo
    └── Se for "PARAR" → opt-out automático
```

### Módulo WhatsApp no código

```
api/src/integrations/whatsapp/
├── client.ts          ← inicializa client, envia mensagens, monta templates
├── webhook.ts         ← recebe status (delivered, read) + mensagens recebidas
└── templates.ts       ← mapa de templates aprovados → parâmetros dinâmicos
```

### Formato do número

A Meta exige formato E.164 sem o `+`:
```
(47) 9 3386-2514  →  554793386251​4
86 9 9999-1234    →  5586999991234
```

O BibelôCRM já armazena telefone em `crm.customers.telefone`. Precisamos de uma função `normalizePhone()` que limpa e formata.

---

## 5. Templates de mensagem (aprovação Meta)

Templates precisam ser **pré-aprovados pela Meta** (24-48h). Cada template tem:
- **Nome** (snake_case, único)
- **Categoria**: MARKETING, UTILITY, ou AUTHENTICATION
- **Idioma**: pt_BR
- **Corpo** com variáveis `{{1}}`, `{{2}}`, etc.
- **Botões** (opcional): CTA (link/telefone) ou Quick Reply

### Templates prioritários para submeter

#### 1. `carrinho_abandonado` (MARKETING)

```
Oi, {{1}}! 🛒

Você deixou itens no carrinho da Papelaria Bibelô!

{{2}}

Finalize sua compra antes que acabe:
[Botão CTA: "Finalizar compra" → {{3}}]
```

Parâmetros:
- `{{1}}` = nome do cliente
- `{{2}}` = lista de produtos + valor total
- `{{3}}` = recovery_url

#### 2. `pos_compra_agradecimento` (UTILITY)

```
{{1}}, seu pedido foi confirmado! 🎀

Obrigada por comprar na Papelaria Bibelô!
Seu pedido #{{2}} no valor de {{3}} está sendo preparado.

Qualquer dúvida, é só responder aqui!
```

#### 3. `boas_vindas_lead` (MARKETING)

```
Oi, {{1}}! Bem-vinda à Papelaria Bibelô! 🎀

Seu cupom de 10% de desconto: BIBELO10

Use na nossa loja:
[Botão CTA: "Usar meu cupom" → https://papelariabibelo.com.br]
```

#### 4. `avaliacao_pos_entrega` (MARKETING)

```
{{1}}, tudo certo com seu pedido? 📦

Adoraríamos saber sua opinião sobre os produtos!
Sua avaliação nos ajuda muito:

[Botão CTA: "Avaliar no Google" → {{2}}]
```

#### 5. `reativacao_saudade` (MARKETING)

```
{{1}}, sentimos sua falta! 💕

Faz tempo que você não visita a Papelaria Bibelô.
Preparamos um desconto especial pra você:

Use o cupom VOLTEI15 e ganhe 15% OFF!

[Botão CTA: "Ver novidades" → https://papelariabibelo.com.br]
```

#### 6. `novidades_vip` (MARKETING)

```
{{1}}, novidade fresquinha! ✨

{{2}}

Corre que as unidades são limitadas!
[Botão CTA: "Ver na loja" → {{3}}]
```

#### 7. `pedido_enviado` (UTILITY)

```
{{1}}, seu pedido foi enviado! 🚚

Pedido: #{{2}}
Rastreio: {{3}}

Acompanhe a entrega pelo link acima!
```

#### 8. `lembrete_cupom` (MARKETING)

```
{{1}}, seu cupom BIBELO10 ainda está ativo! ⏰

10% de desconto em qualquer compra na Papelaria Bibelô.
Válido por mais {{2}} dias!

[Botão CTA: "Usar agora" → https://papelariabibelo.com.br]
```

### Dicas para aprovação rápida

- **Não** usar texto todo em MAIÚSCULAS
- **Não** prometer descontos irreais ("90% OFF")
- **Incluir** nome da empresa no corpo
- **Incluir** opção de opt-out ("Responda PARAR para não receber mais")
- Categoria UTILITY aprova mais rápido que MARKETING
- Testar primeiro com o template de teste padrão da Meta

---

## 6. Fluxos automáticos — email + WhatsApp

### Fluxo 1: Carrinho abandonado (multi-canal)

```
Pedido criado (não pago)
    │
    ├── 1h → WhatsApp: "carrinho_abandonado" (com botão de recovery)
    │         taxa esperada: 95% entrega, 40% leitura
    │
    ├── [se não converteu]
    │   └── 4h → Email: template carrinho abandonado (com imagens dos produtos)
    │             taxa esperada: 30% abertura
    │
    └── [se não converteu]
        └── 24h → WhatsApp: "última chance" (urgência)
                  taxa esperada: 90% entrega, 35% leitura
```

**Steps no JSON do fluxo:**
```json
[
  { "tipo": "whatsapp", "template": "carrinho_abandonado", "delay_horas": 1 },
  { "tipo": "wait", "delay_horas": 3 },
  { "tipo": "email", "template": "carrinho_abandonado", "delay_horas": 0 },
  { "tipo": "wait", "delay_horas": 20 },
  { "tipo": "whatsapp", "template": "ultima_chance_carrinho", "delay_horas": 0 }
]
```

### Fluxo 2: Pós-compra

```
Pedido pago
    │
    ├── 2h → WhatsApp: "pos_compra_agradecimento"
    │         (confirmação rápida, humaniza)
    │
    ├── 3 dias → Email: "novidades relacionadas"
    │             (cross-sell baseado na compra)
    │
    └── [quando entregue]
        └── 12h → WhatsApp: "avaliacao_pos_entrega"
                  (pede review no Google)
```

### Fluxo 3: Boas-vindas (lead capturado)

```
Lead capturado via popup
    │
    ├── Imediato → WhatsApp: "boas_vindas_lead" (se tem telefone)
    │               (cupom BIBELO10 direto no WhatsApp)
    │
    ├── 1h → Email: boas-vindas completo com banner
    │
    ├── 5 dias → WhatsApp: "lembrete_cupom"
    │             (lembra que o cupom ainda vale)
    │
    └── 10 dias → Email: "produtos populares"
                  (social proof, best sellers)
```

### Fluxo 4: Reativação (cliente inativo)

```
Cliente sem compra há 30+ dias
    │
    ├── 30 dias → WhatsApp: "reativacao_saudade" (cupom VOLTEI15)
    │              (mais pessoal, mais urgente)
    │
    ├── [se não converteu]
    │   └── 45 dias → Email: reativação completa com produtos
    │
    └── [se não converteu]
        └── 60 dias → WhatsApp: "última tentativa"
                      (oferta final antes de marcar como churned)
```

### Fluxo 5: Visitou mas não comprou

```
2+ views do mesmo produto em 24h, sem compra
    │
    ├── 4h → WhatsApp: "produto_interesse"
    │         "Oi {{nome}}, vi que você tá de olho no {{produto}}!
    │          Aproveita, são poucas unidades!"
    │
    └── [se não converteu]
        └── 24h → Email: com foto do produto + cupom
```

### Fluxo 6: Pedido enviado

```
Pedido com status "fulfilled" (NuvemShop webhook)
    │
    └── Imediato → WhatsApp: "pedido_enviado" (com código de rastreio)
                   (cliente fica tranquilo, reduz "cadê meu pedido?" no DM)
```

---

## 7. Grupo VIP — estratégia com 115 membros

O grupo VIP é um ativo poderoso. Estratégia para potencializar:

### Regras do grupo (definir com os membros)

- **Novidades exclusivas** antes de todo mundo
- **Cupons especiais** só pro grupo (ex: GRUPOVIP20)
- **Pré-venda** de produtos novos
- **Enquetes** pra decidir novos produtos
- **Bastidores** da loja (humaniza a marca)

### Automações via CRM → Grupo VIP

| Gatilho | Ação no grupo |
|---------|--------------|
| NF de entrada processada (produtos novos chegaram) | Mensagem: "Chegaram produtos novos! Vocês veem primeiro" + fotos |
| Produto voltou ao estoque | Mensagem: "Voltou! {produto} disponível de novo" |
| Black Friday / datas especiais | Cupom exclusivo 24h antes da promoção pública |
| Nova coleção (categoria nova no Bling) | Preview no grupo antes de publicar no site |

### Como integrar tecnicamente

A API do WhatsApp Business **não gerencia grupos diretamente**. Opções:

1. **Mensagens individuais via template** — enviar pra cada membro do grupo uma mensagem template. Funciona, mas gasta cota de conversas.

2. **WhatsApp Channels (Canais)** — recurso nativo do WhatsApp, sem limite de membros, mensagem unidirecional. Ideal pra novidades. Não precisa de API.

3. **Manter grupo manual + CRM automatiza o conteúdo** — O CRM gera o texto + imagens automaticamente (ex: "Novos produtos chegaram: ..."), e envia pro administrador do grupo postar. Semi-automático, mas zero risco.

**Recomendação:** Manter o grupo manual para interação humana (é o charme) + criar um Canal WhatsApp para novidades automáticas + usar templates individuais para ofertas personalizadas.

### Converter membros do grupo em clientes identificados

1. Exportar números dos 115 membros do grupo
2. Importar no CRM com tag `vip_whatsapp`
3. Cruzar com base de clientes existente (match por telefone)
4. Membros que ainda não compraram → fluxo de conversão especial

---

## 8. Catálogo do WhatsApp Business

O catálogo do WhatsApp Business pode ser sincronizado com o BibelôCRM:

### Sincronização de catálogo via API

```
Meta Commerce Manager
    ↓
Catálogo de produtos (conectado ao WhatsApp Business)
    ↓
Pode ser atualizado via API:
POST https://graph.facebook.com/v21.0/{CATALOG_ID}/products
```

### Mensagens com produto do catálogo

A API permite enviar **Product Messages** — mensagem com card de produto clicável:

```json
{
  "messaging_product": "whatsapp",
  "to": "5547933862514",
  "type": "interactive",
  "interactive": {
    "type": "product",
    "body": { "text": "Olha esse produto que separei pra você!" },
    "action": {
      "catalog_id": "CATALOG_ID",
      "product_retailer_id": "SKU_DO_PRODUTO"
    }
  }
}
```

**Caso de uso prático:**
- "Visitou mas não comprou" → envia card do produto específico que o cliente viu
- Pós-compra → envia card de produto complementar (cross-sell)
- Novidades → envia carrossel de 3 produtos novos

### Sincronizar catálogo com Bling/NuvemShop

```
Bling (fonte da verdade)
    ↓ sync 30min
BibelôCRM (crm.products)
    ↓ sync diário
Meta Commerce Manager (catálogo)
    ↓ automático
WhatsApp Business (catálogo visível)
```

---

## 9. Campanhas manuais via CRM

Além dos fluxos automáticos, o CRM já suporta campanhas manuais. Com WhatsApp:

### Tipos de campanha

| Tipo | Canal | Exemplo |
|------|-------|---------|
| Novidades | WhatsApp + Email | "Chegou coleção de volta às aulas!" |
| Promoção | WhatsApp + Email | "30% OFF em papelaria criativa" |
| Data especial | WhatsApp | "Feliz Dia das Mães! Cupom especial" |
| Reativação em massa | WhatsApp | Segmento "inativos 60d" recebe cupom |
| Lançamento | Grupo VIP primeiro, depois WhatsApp geral | Preview exclusivo → depois público |

### Segmentação inteligente

Usando os dados que o CRM já tem:

| Segmento | Critério | Mensagem personalizada |
|----------|----------|----------------------|
| Compras frequentes | 3+ pedidos nos últimos 90d | "Você é VIP! Acesso antecipado à promoção" |
| Ticket alto | Ticket médio > R$150 | "Seleção premium com frete grátis" |
| Compraram categoria X | Pedido com item de "escolar" | "Novidades em material escolar!" |
| Visitaram produto Y | tracking_events com product_view | "O {produto} que você viu está com desconto" |
| Região específica | geo_region = 'SC' ou 'PR' | Frete subsidiado para a região |
| Aniversariantes do mês | customers.data_nascimento | "Parabéns! Presente especial pra você" |

### Fluxo de disparo no CRM

```
1. Carlos cria campanha no frontend (canal: whatsapp)
2. Seleciona template aprovado
3. Seleciona segmento de clientes
4. Preview da mensagem com variáveis preenchidas
5. Agenda ou dispara
6. CRM envia via Meta Cloud API (respeitando rate limits)
7. Dashboard mostra: enviados, entregues, lidos, clicados
```

---

## 10. Métricas e tracking

### Status de entrega (webhook da Meta)

| Status | Significado | Ação no CRM |
|--------|-------------|-------------|
| `sent` | Enviado ao servidor WhatsApp | Atualiza campaign_sends.status |
| `delivered` | Chegou no celular do cliente | Marca como entregue |
| `read` | Cliente abriu a conversa | Equivalente a "abertura" no email |
| `failed` | Não entregou (número inválido, etc.) | Marca erro + alerta |

### Métricas no dashboard

```
Campanhas WhatsApp — últimos 30 dias
├── Mensagens enviadas: 450
├── Taxa de entrega: 96%
├── Taxa de leitura: 72%      ← vs 25% email
├── Cliques no botão: 18%     ← vs 3% email
├── Conversões: 12             ← pedidos atribuídos
└── Receita atribuída: R$ 1.847
```

### Atribuição de conversão

Quando o cliente clica no botão CTA do template (ex: "Finalizar compra"):
1. URL tem UTM: `?utm_source=whatsapp&utm_medium=crm&utm_campaign={campaign_id}`
2. Tracking script captura os UTMs
3. Se comprar em até 7 dias → receita atribuída à campanha WhatsApp

---

## 11. Custos e limites

### Tabela de preços (Brasil, 2026)

| Tipo de conversa | Quem inicia | Custo por conversa |
|-------------------|------------|-------------------|
| Marketing | Negócio | ~R$ 0,50 |
| Utility | Negócio | ~R$ 0,15 |
| Authentication | Negócio | ~R$ 0,15 |
| Service | Cliente responde | Grátis (primeiras 1.000/mês) |

> **1.000 conversas grátis/mês** iniciadas por clientes (Service). Marketing e Utility sempre são pagas.

### Estimativa mensal para a Bibelô

| Fluxo | Msgs estimadas/mês | Categoria | Custo estimado |
|-------|--------------------|-----------|---------------|
| Carrinho abandonado | ~60 | Marketing | R$ 30 |
| Pós-compra | ~80 | Utility | R$ 12 |
| Pedido enviado | ~80 | Utility | R$ 12 |
| Boas-vindas lead | ~40 | Marketing | R$ 20 |
| Reativação | ~30 | Marketing | R$ 15 |
| Campanhas manuais | ~200 | Marketing | R$ 100 |
| **Total estimado** | **~490** | | **~R$ 189/mês** |

> Comparar com retorno: se recuperar 5 carrinhos abandonados/mês a R$120 ticket médio = R$600 de receita extra. ROI de 3x só no carrinho.

### Rate limits da Meta Cloud API

- **Marketing**: 1.000 mensagens nas primeiras 24h após registro. Sobe conforme qualidade (tier system).
- **Tier 1**: 1.000/dia → **Tier 2**: 10.000/dia → **Tier 3**: 100.000/dia
- Para subir de tier: manter qualidade alta (baixo bloqueio/denúncia) por 7 dias
- **A Bibelô vai operar confortavelmente no Tier 1** (~30 msgs/dia)

### Qualidade do número

A Meta monitora a qualidade:
- **Verde**: tudo OK, pode subir de tier
- **Amarelo**: atenção, algumas denúncias
- **Vermelho**: risco de bloqueio, pausar envios

**Como manter verde:**
- Não enviar pra quem não é cliente
- Respeitar opt-out imediatamente
- Mensagens relevantes e personalizadas (não spam genérico)
- Frequência máxima: 4 mensagens/mês por cliente

---

## 12. Roadmap de implementação

### Fase 1 — Fundação (1-2 dias)

- [ ] Carlos cria app no Meta for Developers
- [ ] Registra número (47) 9 3386-2514 na API
- [ ] Submete 3 templates iniciais: `carrinho_abandonado`, `pos_compra_agradecimento`, `boas_vindas_lead`
- [ ] Configura webhook de status no Meta → `webhook.papelariabibelo.com.br/api/webhooks/whatsapp`
- [ ] Salva tokens no `.env`

### Fase 2 — Backend (1 dia de dev)

- [ ] Criar `api/src/integrations/whatsapp/client.ts` — envio via Meta Cloud API
- [ ] Criar `api/src/integrations/whatsapp/webhook.ts` — receber status + mensagens
- [ ] Implementar `executeWhatsAppStep()` no `flow.service.ts` (substituir skeleton atual)
- [ ] Criar rota `POST /api/webhooks/whatsapp` com verificação de assinatura
- [ ] Função `normalizePhone()` — (47) 9 3386-2514 → 554793386251​4
- [ ] Nginx: adicionar rota webhook WhatsApp no `webhook.papelariabibelo.com.br`

### Fase 3 — Fluxos multi-canal (1 dia de dev)

- [ ] Atualizar fluxo "carrinho abandonado" → WhatsApp 1h + email 4h
- [ ] Atualizar fluxo "pós-compra" → WhatsApp 2h + email 3d
- [ ] Atualizar fluxo "boas-vindas" → WhatsApp imediato + email 1h
- [ ] Criar fluxo "pedido enviado" → WhatsApp com rastreio
- [ ] Submeter templates restantes: `avaliacao_pos_entrega`, `reativacao_saudade`, `lembrete_cupom`, `novidades_vip`, `pedido_enviado`

### Fase 4 — Dashboard e campanhas (1 dia de dev)

- [ ] Status de entrega (sent/delivered/read) no dashboard
- [ ] Métricas WhatsApp na página Marketing
- [ ] Campanhas manuais via WhatsApp no frontend
- [ ] Segmentação por telefone disponível

### Fase 5 — Catálogo e grupo VIP

- [ ] Conectar catálogo do Commerce Manager via API
- [ ] Mensagens com card de produto (Product Messages)
- [ ] Automação de novidades para grupo VIP (semi-automático)
- [ ] Exportar e cruzar membros do grupo com base CRM

---

## Anexos

### A. Exemplo de chamada à API

```bash
curl -X POST "https://graph.facebook.com/v21.0/{PHONE_ID}/messages" \
  -H "Authorization: Bearer {WHATSAPP_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "5547933862514",
    "type": "template",
    "template": {
      "name": "carrinho_abandonado",
      "language": { "code": "pt_BR" },
      "components": [
        {
          "type": "body",
          "parameters": [
            { "type": "text", "text": "Maria" },
            { "type": "text", "text": "Caderno Pontilhado + Canetas Pastel — R$ 89,90" }
          ]
        },
        {
          "type": "button",
          "sub_type": "url",
          "index": "0",
          "parameters": [
            { "type": "text", "text": "/checkout/v3/proxy/abc123/token456" }
          ]
        }
      ]
    }
  }'
```

### B. Webhook de status (exemplo de payload)

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WHATSAPP_BUSINESS_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "phone_number_id": "PHONE_ID" },
        "statuses": [{
          "id": "wamid.xxx",
          "status": "delivered",
          "timestamp": "1711836000",
          "recipient_id": "5547933862514"
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### C. Opt-out automático

Quando o cliente responde "PARAR", "SAIR", "CANCELAR" ou "STOP":
1. Webhook recebe a mensagem
2. CRM marca `crm.customers.whatsapp_optout = true`
3. Nenhum fluxo ou campanha WhatsApp é enviado mais
4. Resposta automática: "Pronto! Você não receberá mais mensagens. Para voltar a receber, envie OI."

---

*Documento criado para o projeto BibelôCRM — Ecossistema Bibelô*
*Canal de suporte: contato@papelariabibelo.com.br*
