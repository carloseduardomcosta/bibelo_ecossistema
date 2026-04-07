# Email Templates — BibelôCRM

Referência completa dos templates de email usados nos fluxos automáticos.

---

## Arquitetura

### Componentes

| Componente | Arquivo | Função |
|---|---|---|
| `emailWrapper()` | `api/src/services/flow.service.ts` | Header + footer padrão (logo, gradiente, CNPJ, descadastro LGPD) |
| `ctaButton()` | `api/src/services/flow.service.ts` | Botão CTA rosa gradiente com sombra |
| `buildFlowEmail()` | `api/src/services/flow.service.ts` | Dispatcher — resolve template name → função HTML |
| `getFlowSubject()` | `api/src/services/flow.service.ts` | Dispatcher — resolve template name → subject do email |
| `safeImageUrl()` | `api/src/services/flow.service.ts` | Força HTTPS + passa pelo proxy de imagens |
| `cleanProductUrl()` | `api/src/services/flow.service.ts` | Remove fbclid/UTMs de ads, adiciona UTMs de flow |
| `proxyImageUrl()` | `api/src/routes/email.ts` | Proxy de imagens: cacheia + converte webp→jpg (Sharp) |
| `buildCartProductsTable()` | `api/src/services/flow.service.ts` | Tabela de produtos reutilizável (imagem + nome + preço + qtd) |
| `buildTopProductsGrid()` | `api/src/services/flow.service.ts` | Grid de produtos mais vistos do tracking (async, busca no banco) |

### Layout padrão (emailWrapper)

Todos os 23 templates usam o mesmo wrapper:

```
┌─────────────────────────────────────┐
│  Header: gradiente #fff7c1 → #ffe5ec │
│  Logo circular + borda #fe68c4       │
│  "Papelaria Bibelô"                  │
│  "Encantando momentos com papelaria" │
├─────────────────────────────────────┤
│  Content: padding 35px 30px          │
│  [template-specific content]         │
│  WhatsApp: (47) 9 3386-2514          │
├─────────────────────────────────────┤
│  Footer: background #fff7c1          │
│  CNPJ 63.961.764/0001-63            │
│  papelariabibelo.com.br              │
│  @papelariabibelo (Instagram)        │
│  Política de Privacidade             │
│  Termos de Uso                       │
│  Descadastrar (link LGPD)            │
└─────────────────────────────────────┘
```

- Fonte: Jost (fallback: Segoe UI, Arial)
- Cor primária: `#fe68c4` (pink)
- Background: `#ffe5ec` (rosa)
- Destaque: `#fff7c1` (amarelo)

### Proxy de imagens

Todas as imagens externas passam pelo proxy `proxyImageUrl()`:
- URL final: `webhook.papelariabibelo.com.br/api/email/img/{hash}.{ext}`
- **webp → jpg** automático via Sharp (qualidade 90%) — Outlook/Yahoo não suportam webp
- Cache: 30 dias no servidor, auto-cleanup 1h para temporários
- Domínios permitidos: `dcdn-us.mitiendanube.com`, `d2r9epyceweg5n.cloudfront.net`, `orgbling.s3.amazonaws.com`

### Segurança

- `escHtml()` aplicado em todos os nomes de clientes e produtos no HTML
- Subjects (text/plain) não precisam de escHtml
- URLs de produtos limpas via `cleanProductUrl()` (remove fbclid, UTMs de ads)
- Link de descadastro LGPD em todos os emails
- Fallback genérico loga warning para detecção de templates sem match

---

## Templates (23 ativos)

### Carrinho Abandonado

| # | Template | Função | Subject |
|---|----------|--------|---------|
| 1 | `Carrinho abandonado` | `buildAbandonedCartEmail` | `{nome}, seus itens estão reservados! 🛒` |
| 2 | `Última chance` | `buildLastChanceEmail` | `⏰ Última chance, {nome} — estoque quase esgotado!` |
| 3 | `Carrinho reenvio` | `buildCartReminderEmail` | `{nome}, +500 clientes aprovam — seus itens ainda estão aqui! 💕` |
| 4 | `Cupom recuperação carrinho` | `buildCartCouponEmail` | `🎁 {nome}, um presente para você finalizar sua compra!` |
| 5 | `carrinho tracking itens esperando` | `buildTrackingCartEmail` | `{nome}, seus itens estão esperando no carrinho! 🛒` |
| 6 | `carrinho tracking ultima chance` | `buildLastChanceEmail` | (mesmo que Última chance) |

**Conteúdo dinâmico**: tabela de produtos com imagem (via proxy jpg), nome escapado, preço, quantidade, total em rosa (#fe68c4), banner frete grátis Sul/Sudeste R$79+, link recovery checkout.

**Cupom**: step "Cupom recuperação carrinho" gera cupom único BIB-NOME-XXXX (5%, 24h) via NuvemShop API.

### Nutrição de Lead

| # | Template | Função | Subject |
|---|----------|--------|---------|
| 7 | `Lead boas-vindas clube` | `buildWelcomeEmail` | `Bem-vinda à Papelaria Bibelô, {nome}! 🎀` |
| 8 | `Lead cupom exclusivo` | `buildLeadCouponEmail` | `🎁 {nome}, seu cupom exclusivo está esperando!` |
| 9 | `Lead FOMO grupo VIP` | `buildFomoVipEmail` | `{nome}, +115 membros já garantiram — e você? 🔥` |
| 10 | `Lead convite VIP` | `buildVipInviteEmail` | `{nome}, você foi convidada para o grupo VIP! 🎀` |

**Cupom**: step "Lead cupom exclusivo" gera cupom único BIB-NOME-XXXX (10%, 48h).

### Produto / Interesse

| # | Template | Função | Subject |
|---|----------|--------|---------|
| 11 | `Produto visitado` | `buildProductVisitedEmail` | `{nome}, ainda de olho? Temos boas notícias! 👀` |
| 12 | `Novidades da Semana` | `buildNewsEmail` | `{nome}, novidades fresquinhas na Bibelô! 🆕` |
| 13 | `Produtos populares` | `buildPopularProductsEmail` | `{nome}, esses são os queridinhos da Bibelô! ✨` |

**Dados reais**: Produto visitado usa metadata do tracking (imagem, nome, preço, URL). Novidades e Populares buscam top 4 produtos do `crm.tracking_events` dos últimos 14-30 dias.

### Pós-compra

| # | Template | Função | Subject |
|---|----------|--------|---------|
| 14 | `Agradecimento` / `Pós-compra` | `buildThankYouEmail` | `Obrigada pela compra, {nome}! 💕` |
| 15 | `Boas-vindas` | `buildWelcomeEmail` | `Bem-vinda à Papelaria Bibelô, {nome}! 🎀` |
| 16 | `Pedido de avaliação` | `buildReviewRequestEmail` | `{nome}, conta pra gente: o que achou? ⭐` |

**Avaliação**: CTA leva direto para Google Reviews (`g.page/r/CdahFa43hhIXEAE/review`).

### Cross-sell e Recompra

| # | Template | Função | Subject |
|---|----------|--------|---------|
| 17 | `cross-sell complemento` | `buildCrossSellEmail` | `{nome}, produtos que combinam com sua compra! ✨` |
| 18 | `cross-sell lembrete` | `buildCrossSellEmail` | (mesmo) |
| 19 | `recompra favoritos` | `buildRepurchaseEmail` | `{nome}, hora de repor seus favoritos! 🎀` |
| 20 | `lembrete recompra favoritos esperando` | `buildRepurchaseEmail` | `{nome}, seus favoritos estão esperando! 💕` |

**Dados reais**: Cross-sell busca produtos complementares por co-compra no Bling. Recompra busca produtos comprados 2+ vezes pelo cliente.

### Reativação

| # | Template | Função | Subject |
|---|----------|--------|---------|
| 21 | `Reativação` | `buildReactivationEmail` | `Sentimos sua falta, {nome}! 💌` |
| 22 | `Reativação cupom` | `buildReactivationEmail` | (mesmo) |
| 23 | `Sentimos sua falta` | `buildReactivationEmail` | (mesmo) |

**Cupom**: step "Reativação cupom" gera cupom único BIB-NOME-XXXX (10%, 7 dias).
**Dados reais**: mostra top 4 produtos mais vistos com imagens reais do tracking.

### Outros

| # | Template | Função | Subject |
|---|----------|--------|---------|
| — | `Lembrete cupom` | `buildCouponReminderEmail` | `⏰ {nome}, seu cupom de desconto está acabando!` |
| — | `Prova social` | `buildSocialProofEmail` | `{nome}, veja o que nossas clientes estão dizendo! ⭐` |

**Prova social**: busca reviews reais via Google Places API (cache).

---

## Fluxos ativos (11)

### Carrinho abandonado inteligente (12 steps)

Gatilho: `order.abandoned` — pedido criado sem pagamento após 2h.

**Cadeia com NuvemShop**: a NuvemShop envia email genérico de carrinho (~30min). O CRM entra 2h depois com fluxo sofisticado.

```
Step 0  │ EMAIL "Carrinho abandonado"         (delay 2h)
Step 1  │ WAIT 12h
Step 2  │ CONDIÇÃO: abriu email?
        │   SIM → Step 3    NÃO → Step 6
Step 3  │ CONDIÇÃO: clicou?
        │   SIM → Step 4    NÃO → Step 5
Step 4  │ CONDIÇÃO: comprou?
        │   SIM → FIM       NÃO → Step 5
Step 5  │ EMAIL "Última chance"               → Step 8
Step 6  │ EMAIL "Carrinho reenvio"            → Step 8
Step 7  │ EMAIL "Carrinho reenvio" (fallback)
Step 8  │ WAIT 36h
Step 9  │ CONDIÇÃO: comprou?
        │   SIM → FIM       NÃO → Step 10
Step 10 │ CONDIÇÃO: abriu algum email?
        │   SIM → Step 11   NÃO → FIM
Step 11 │ EMAIL "Cupom recuperação carrinho"  (5% OFF, 24h)
```

### Nutrição de lead inteligente (12 steps)

Gatilho: `lead.captured` — email verificado via HMAC.

```
Step 0  │ EMAIL "Lead cupom exclusivo"        (delay 0h — imediato)
Step 1  │ WAIT 48h
Step 2  │ CONDIÇÃO: abriu email?
        │   (branching para popular vs cupom reminder)
...     │ Novidades, FOMO VIP, Convite VIP, Prova Social
Step 11 │ EMAIL "Lead convite VIP"
```

### Pós-compra inteligente (8 steps)

Gatilho: `order.paid` — pagamento confirmado.

```
Step 0  │ EMAIL "Agradecimento"               (delay 1h)
Step 1  │ WAIT 120h (5 dias)
Step 2  │ CONDIÇÃO: abriu?
Step 3  │ EMAIL "Pedido de avaliação"
Step 4  │ EMAIL "Novidades da Semana"
Step 5  │ WAIT 168h (7 dias)
Step 6  │ CONDIÇÃO: comprou de novo?
Step 7  │ EMAIL "Lead convite VIP"
```

### Outros fluxos

| Fluxo | Gatilho | Steps | Emails |
|---|---|---|---|
| Lead boas-vindas clube | `lead.captured` | 1 | 1 |
| Lead quente inteligente | `lead.cart_abandoned` | 10 | 4 |
| Carrinho tracking abandonado | `cart.tracking` | 4 | 2 |
| Boas-vindas novo cliente | `order.first` | 3 | 2 |
| Cross-sell pós-compra | `order.paid` | 6 | 2 |
| Recompra inteligente | `order.recompra` | 4 | 2 |
| Produto visitado inteligente | `product.interested` | 10 | 4 |
| Reativação inteligente | `customer.inactive` | 10 | 4 |

---

## NuvemShop vs BibelôCRM — Mapa de responsabilidades

### NuvemShop (transacionais — manter ativo)

| Email | Momento |
|---|---|
| Ativação da conta | Criação de conta |
| Mudança de senha | Reset de senha |
| Boas-vindas conta | Conta ativada |
| Confirmação de compra | Pedido criado |
| Confirmação de pagamento | Pagamento aprovado |
| Confirmação de envio | Pedido despachado (código rastreio) |
| Pronto para retirada | Retirada na loja |
| Cancelamento de compra | Pedido cancelado |
| Nota fiscal | NF emitida |
| **Carrinho abandonado** | **~30min (primeiro toque leve)** |

### BibelôCRM (marketing/nurture)

| Email | Momento |
|---|---|
| Carrinho abandonado (12 steps) | 2h+ (segundo toque com branching + cupom) |
| Nutrição de lead (12 steps) | Após verificação email |
| Lead boas-vindas | Após verificação email |
| Lead quente | add_to_cart sem compra |
| Carrinho tracking | add_to_cart via pixel sem checkout |
| Produto visitado | Viu 2x em 24h sem comprar |
| Pós-compra (8 steps) | 1h após pagamento |
| Boas-vindas 1ª compra | 1º pedido pago |
| Cross-sell | 7 dias após compra |
| Recompra | 80% do ciclo do cliente |
| Reativação | Inativo no ciclo |

### Regra

- **NuvemShop** = transacional puro (confirmações, segurança, operacional)
- **BibelôCRM** = marketing, nurture, recuperação, relacionamento
- **Carrinho**: NuvemShop dá primeiro toque (~30min), CRM faz trabalho pesado (2h+)
- Se cliente compra antes do CRM agir → `markOrderConverted()` cancela o fluxo

### Triggers no código sem fluxo ativo (de propósito)

| Trigger | Status | Motivo |
|---|---|---|
| `customer.created` | Código dispara, sem fluxo | NuvemShop já envia "Boas-vindas conta" |
| `order.delivered` | Código dispara, sem fluxo | Candidato futuro para pedir avaliação pós-entrega |

---

## Rate limits e proteções

- **12h entre emails** por cliente (exceto transacionais: `order.paid`, `order.first`, `order.abandoned`, `order.delivered`)
- **90 dias** de janela para re-engajamento do mesmo fluxo por cliente
- **LGPD**: respeita `email_optout` — sem email se opt-out
- **Sem email**: não cria fluxo se cliente não tem email
- **Idempotência**: `triggerFlow` não re-executa se já existe execução dentro da janela

---

## Cupons automáticos

| Cenário | Template que gera | Tipo | Valor | Validade |
|---|---|---|---|---|
| Carrinho abandonado | `Cupom recuperação carrinho` | percentage | 5% | 24h |
| Nutrição lead | `Lead cupom exclusivo` | percentage | 10% | 48h |
| Reativação | `Reativação cupom` | percentage | 10% | 7 dias |

Formato: `BIB-{NOME}-{HEX}` (ex: `BIB-MARIA-A1F3`)
API: NuvemShop Coupons (`max_uses: 1`, `first_consumer_purchase: true`)

---

*Última atualização: 5 de Abril de 2026 — auditoria completa de templates, 7 fallbacks corrigidos, proxy webp→jpg, cleanProductUrl, produtos reais nos templates estáticos*
