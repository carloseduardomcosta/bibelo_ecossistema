# Documentação de Integrações — Ecossistema Bibelô

> Referência técnica para o Claude Code implementar as integrações do
> e-commerce da Papelaria Bibelô. Atualizado em Abril/2026.
> Combina com: `docs/integracoes/bling-referencia.md`, `docs/integracoes/nuvemshop-guia.md`

---

## Índice

1. [Mercado Pago](#1-mercado-pago)
2. [Melhor Envio](#2-melhor-envio)
3. [Bling ERP v3](#3-bling-erp-v3)
4. [Fluxo completo de um pedido](#4-fluxo-completo-de-um-pedido)
5. [Variáveis de ambiente necessárias](#5-variáveis-de-ambiente-necessárias)
6. [Segurança e boas práticas](#6-segurança-e-boas-práticas)

---

## 1. Mercado Pago

### 1.1 Visão geral

| Item | Valor |
|---|---|
| Base URL produção | `https://api.mercadopago.com` |
| Base URL sandbox | `https://api.mercadopago.com` (mesmo, credenciais de teste) |
| Autenticação | `Authorization: Bearer ACCESS_TOKEN` |
| SDK Node.js | `npm install mercadopago` |
| Versão SDK | v2+ (breaking change em relação à v1) |
| Documentação | https://www.mercadopago.com.br/developers/pt |

### 1.2 Credenciais

```
PUBLIC_KEY     → usada no frontend (tokenizar cartão)
ACCESS_TOKEN   → usada no backend (criar pagamentos, consultar)
```

Credenciais de teste ficam em: Suas integrações → Dados da integração → Testes.
Credenciais de produção ficam em: Suas integrações → Dados da integração → Produção.

**NUNCA expor ACCESS_TOKEN no frontend.**

### 1.3 Checkout transparente — API Orders (nova, recomendada 2025)

A Mercado Pago lançou em 2025 a **API Orders**, que substitui a antiga API Payments
para o Checkout Transparente. Ela unifica todos os meios de pagamento em uma única
integração.

**Criar uma order:**
```http
POST https://api.mercadopago.com/v1/orders
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{
  "type": "online",
  "processing_mode": "automatic",
  "total_amount": "100.00",
  "external_reference": "BIBELO-ORDER-123",
  "payer": {
    "email": "cliente@email.com",
    "identification": {
      "type": "CPF",
      "number": "01234567890"
    }
  },
  "transactions": {
    "payments": [
      {
        "amount": "100.00",
        "payment_method": {
          "id": "pix",
          "type": "bank_transfer"
        }
      }
    ]
  }
}
```

**Consultar order:**
```http
GET https://api.mercadopago.com/v1/orders/{id}
Authorization: Bearer ACCESS_TOKEN
```

**Status possíveis de uma order:**
- `open` → criada, aguardando pagamento
- `processed` → paga com sucesso
- `expired` → expirou sem pagamento
- `canceled` → cancelada

### 1.4 Pix

```http
POST https://api.mercadopago.com/v1/orders
```

```json
{
  "transactions": {
    "payments": [{
      "amount": "100.00",
      "payment_method": {
        "id": "pix",
        "type": "bank_transfer"
      }
    }]
  }
}
```

A resposta retorna `qr_code` e `qr_code_base64` para exibir ao cliente.
O Pix expira em 30 minutos por padrão (configurável).

### 1.5 Cartão de crédito

O cartão nunca passa pelo seu servidor. O fluxo é:

```
1. Frontend usa MercadoPago.js para tokenizar o cartão
   → retorna card_token (válido por 7 dias, uso único)

2. Backend recebe o card_token e cria a order:
```

```json
{
  "transactions": {
    "payments": [{
      "amount": "100.00",
      "payment_method": {
        "id": "visa",
        "type": "credit_card",
        "token": "CARD_TOKEN_DO_FRONTEND",
        "installments": 3
      }
    }]
  }
}
```

**Cartões de teste:**
```
Aprovado:  5031 4332 1540 6351  CVV: 123  Validade: 11/25  Nome: APRO
Recusado:  5031 4332 1540 6351  CVV: 123  Validade: 11/25  Nome: OTHE
Pendente:  5031 4332 1540 6351  CVV: 123  Validade: 11/25  Nome: CONT
CPF teste: 123.456.789-09
```

### 1.6 Boleto bancário

```json
{
  "transactions": {
    "payments": [{
      "amount": "100.00",
      "payment_method": {
        "id": "bolbradesco",
        "type": "ticket"
      }
    }]
  },
  "payer": {
    "address": {
      "zip_code": "89093-880",
      "street_name": "R. Mal. Floriano Peixoto",
      "street_number": "941",
      "neighborhood": "Padre Martinho Stein",
      "city": "Timbó",
      "federal_unit": "SC"
    }
  }
}
```

Prazo de aprovação: até 2h úteis.
Expiração padrão: 3 dias (configurar no mínimo 3 dias).

### 1.7 Webhooks / Notificações

Configurar em: Suas integrações → Webhooks.

```
URL de notificação: https://api.papelariabibelo.com.br/webhooks/mercadopago
```

**Payload recebido:**
```json
{
  "action": "payment.created",
  "api_version": "v1",
  "data": { "id": "1323479563" },
  "date_created": "2026-04-01T12:00:00Z",
  "id": 113614395815,
  "live_mode": true,
  "type": "payment",
  "user_id": "234420836"
}
```

**Tópicos de notificação disponíveis:**
- `payment` → criado, atualizado
- `order` → criado, atualizado (nova API Orders)
- `chargebacks` → contestações
- `merchant_order` → pedidos

**Validar autenticidade do webhook:**
```typescript
// O MP envia o header x-signature
// Validar com HMAC-SHA256 usando o webhook_secret
import crypto from 'crypto';

function validateMPWebhook(
  xSignature: string,
  xRequestId: string,
  dataId: string,
  secret: string
): boolean {
  const parts = xSignature.split(',');
  const ts = parts.find(p => p.startsWith('ts='))?.split('=')[1];
  const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1];
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(v1 ?? ''));
}
```

### 1.8 Reembolsos

```http
POST https://api.mercadopago.com/v1/payments/{payment_id}/refunds
Authorization: Bearer ACCESS_TOKEN

{
  "amount": 50.00  // omitir para reembolso total
}
```

### 1.9 SDK Node.js — exemplo completo

```typescript
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  options: { timeout: 5000 }
});

// Criar preferência (Checkout Pro)
const preference = new Preference(client);
const result = await preference.create({
  body: {
    items: [{
      title: 'Lápis Faber-Castell Sparkle Pastel 12 cores',
      quantity: 1,
      unit_price: 59.90,
      currency_id: 'BRL'
    }],
    payer: { email: 'cliente@email.com' },
    external_reference: 'BIBELO-ORDER-123',
    notification_url: 'https://api.papelariabibelo.com.br/webhooks/mercadopago',
    back_urls: {
      success: 'https://papelariabibelo.com.br/pedido/sucesso',
      failure: 'https://papelariabibelo.com.br/pedido/erro',
      pending: 'https://papelariabibelo.com.br/pedido/pendente'
    }
  }
});

// result.init_point → URL para redirecionar o cliente
```

---

## 2. Melhor Envio

### 2.1 Visão geral

| Item | Valor |
|---|---|
| Base URL produção | `https://melhorenvio.com.br/api/v2` |
| Base URL sandbox | `https://sandbox.melhorenvio.com.br/api/v2` |
| Autenticação | OAuth2 + `Authorization: Bearer TOKEN` |
| Header obrigatório | `User-Agent: BibelôEcommerce (carloseduardocostatj@gmail.com)` |
| Integração | Gratuita, sem mensalidade |
| Documentação | https://docs.melhorenvio.com.br |

**O header `User-Agent` é OBRIGATÓRIO.** Requisições sem ele são rejeitadas.

### 2.2 Autenticação OAuth2

```
1. Criar aplicação em: https://melhorenvio.com.br/painel/gerenciar/tokens
2. Obter: client_id, client_secret
3. Redirecionar usuário para autorização
4. Trocar code por token
5. Usar Bearer token nas requisições
```

**Authorization URL:**
```
https://melhorenvio.com.br/oauth/authorize
  ?client_id=CLIENT_ID
  &redirect_uri=https://api.papelariabibelo.com.br/callbacks/melhorenvio
  &response_type=code
  &scope=cart-read cart-write companies-read coupons-read notifications-read
         orders-read products-read products-write purchases-read
         shipping-calculate shipping-cancel shipping-checkout
         shipping-generate shipping-preview shipping-print
         shipping-tracking transactions-read users-read
```

**Trocar code por token:**
```http
POST https://melhorenvio.com.br/oauth/token

{
  "grant_type": "authorization_code",
  "client_id": "CLIENT_ID",
  "client_secret": "CLIENT_SECRET",
  "redirect_uri": "https://api.papelariabibelo.com.br/callbacks/melhorenvio",
  "code": "CODE_RECEBIDO"
}
```

**Renovar token:**
```http
POST https://melhorenvio.com.br/oauth/token

{
  "grant_type": "refresh_token",
  "client_id": "CLIENT_ID",
  "client_secret": "CLIENT_SECRET",
  "refresh_token": "REFRESH_TOKEN"
}
```

Tokens expiram em 30 dias. Salvar `access_token` e `refresh_token` no banco.

### 2.3 Fluxo completo de etiqueta

```
1. Calcular frete      → GET /shipment/calculate
2. Adicionar ao carrinho → POST /me/cart
3. Comprar etiqueta    → POST /me/cart/checkout
4. Gerar etiqueta      → POST /me/shipment/generate
5. Imprimir etiqueta   → POST /me/shipment/print
6. Rastrear            → GET /me/shipment/tracking
```

### 2.4 Calcular frete

```http
GET https://melhorenvio.com.br/api/v2/me/shipment/calculate
Authorization: Bearer TOKEN
User-Agent: BibelôEcommerce (carloseduardocostatj@gmail.com)
Accept: application/json

Parâmetros query:
from[postal_code]=89093880   → CEP origem (Timbó SC)
to[postal_code]=CEPCLIENTE
package[height]=10
package[width]=15
package[length]=20
package[weight]=0.5          → em kg
```

**Resposta:**
```json
[
  {
    "id": 1,
    "name": "PAC",
    "price": "18.50",
    "currency": "R$",
    "delivery_time": 7,
    "delivery_range": { "min": 5, "max": 9 },
    "company": { "id": 1, "name": "Correios", "picture": "..." },
    "error": null
  },
  {
    "id": 2,
    "name": "SEDEX",
    "price": "32.90",
    "delivery_time": 2,
    "company": { "id": 1, "name": "Correios" }
  },
  {
    "id": 7,
    "name": "Expresso",
    "price": "15.30",
    "company": { "id": 6, "name": "Jadlog" }
  }
]
```

Se `error` não for null, aquela transportadora não atende o trecho.

### 2.5 Adicionar ao carrinho

```http
POST https://melhorenvio.com.br/api/v2/me/cart
Authorization: Bearer TOKEN
User-Agent: BibelôEcommerce (carloseduardocostatj@gmail.com)

{
  "service": 1,
  "agency": null,
  "from": {
    "name": "Papelaria Bibelô",
    "phone": "47933862514",
    "email": "contato@papelariabibelo.com.br",
    "document": "63961764000163",
    "company_document": "63961764000163",
    "postal_code": "89093880",
    "address": "R. Mal. Floriano Peixoto",
    "number": "941",
    "district": "Padre Martinho Stein",
    "city": "Timbó",
    "state_abbr": "SC",
    "country_id": "BR"
  },
  "to": {
    "name": "Nome do Cliente",
    "phone": "11999999999",
    "email": "cliente@email.com",
    "document": "CPF_CLIENTE",
    "postal_code": "CEPCLIENTE",
    "address": "Rua do Cliente",
    "number": "123",
    "district": "Bairro",
    "city": "Cidade",
    "state_abbr": "UF",
    "country_id": "BR"
  },
  "products": [
    {
      "name": "Lápis Faber-Castell Sparkle",
      "quantity": 1,
      "unitary_value": 59.90,
      "weight": 0.1
    }
  ],
  "volumes": [
    {
      "height": 5,
      "width": 15,
      "length": 20,
      "weight": 0.3
    }
  ],
  "options": {
    "insurance_value": 59.90,
    "receipt": false,
    "own_hand": false,
    "reverse": false,
    "non_commercial": false
  }
}
```

**Resposta:** retorna `id` do item no carrinho (salvar para próximos passos).

### 2.6 Checkout (comprar etiqueta)

```http
POST https://melhorenvio.com.br/api/v2/me/cart/checkout
Authorization: Bearer TOKEN

{
  "orders": ["ID_DO_CARRINHO"]
}
```

Debita o valor do saldo da conta Melhor Envio.
**Atenção:** o cliente deve ter saldo suficiente na carteira ME.

### 2.7 Gerar etiqueta

```http
POST https://melhorenvio.com.br/api/v2/me/shipment/generate
Authorization: Bearer TOKEN

{
  "orders": ["ID_DO_CARRINHO"]
}
```

### 2.8 Imprimir etiqueta

```http
POST https://melhorenvio.com.br/api/v2/me/shipment/print
Authorization: Bearer TOKEN

{
  "mode": "private",
  "orders": ["ID_DO_CARRINHO"]
}
```

Retorna URL para download do PDF da etiqueta.

### 2.9 Rastreamento

```http
GET https://melhorenvio.com.br/api/v2/me/shipment/tracking
Authorization: Bearer TOKEN

Parâmetros: orders[]=ID_DO_CARRINHO
```

### 2.10 Cancelar envio

```http
POST https://melhorenvio.com.br/api/v2/me/shipment/cancel
Authorization: Bearer TOKEN

{
  "order": "ID_DO_CARRINHO"
}
```

Só é possível cancelar antes de postar.

### 2.11 IDs das transportadoras

| ID | Transportadora |
|---|---|
| 1 | Correios |
| 2 | Correios |
| 3 | Jadlog |
| 4 | Via Brasil |
| 6 | Jadlog |
| 7 | Azul Cargo |
| 9 | Latam Cargo |
| 16 | Sequoia |
| 17 | Buslog |

---

## 3. Bling ERP v3

> Complementa `docs/integracoes/bling-referencia.md` com foco no e-commerce Medusa.

### 3.1 Visão geral

| Item | Valor |
|---|---|
| Base URL | `https://www.bling.com.br/Api/v3` |
| Autenticação | OAuth2 |
| Rate limit | **3 req/s** — delay mínimo 350ms entre chamadas |
| Retry em 429 | Aguardar `Retry-After` header |
| Documentação | https://developer.bling.com.br |

### 3.2 Autenticação OAuth2

Tokens ficam em `sync.sync_state` no banco.

```typescript
// Refresh automático quando access_token expirar
async function getBlingToken(): Promise<string> {
  const state = await queryOne(
    `SELECT access_token, refresh_token, expires_at
     FROM sync.sync_state WHERE key = 'bling_oauth'`
  );
  
  if (new Date(state.expires_at) > new Date()) {
    return state.access_token;
  }
  
  // Refresh
  const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: state.refresh_token
    }),
    // Basic Auth com client_id:client_secret em base64
    ...buildBlingAuthHeader()
  });
  
  const data = await response.json();
  await query(
    `UPDATE sync.sync_state
     SET access_token = $1, refresh_token = $2,
         expires_at = NOW() + INTERVAL '6 hours'
     WHERE key = 'bling_oauth'`,
    [data.access_token, data.refresh_token]
  );
  
  return data.access_token;
}
```

### 3.3 Endpoints essenciais para o e-commerce

#### Produtos

```http
# Listar produtos (paginado, máx 100 por página)
GET /produtos?pagina=1&limite=100&situacao=A

# Buscar produto por ID
GET /produtos/{id}

# Buscar produto por SKU (código)
GET /produtos?codigo=SKU123

# ATENÇÃO: listagem NÃO retorna categoria
# Para categoria, buscar individualmente por ID
```

**Estrutura de produto:**
```json
{
  "id": 123456,
  "nome": "LAPIS 12 CORES FABER CASTELL SPARKLE PASTEL",
  "codigo": "LP-FAB-SPARK-12",
  "preco": 59.90,
  "precoCusto": 28.00,
  "situacao": "A",
  "descricaoCurta": "...",
  "descricaoComplementar": "...",
  "unidade": "UN",
  "peso": { "bruto": 0.12, "liquido": 0.10 },
  "dimensoes": { "largura": 15, "altura": 5, "profundidade": 2 },
  "estoque": { "minimo": 2, "maximo": 100 },
  "midia": [
    { "url": "https://...", "tipo": "Imagem Principal" }
  ],
  "variante": [...],
  "categoria": { "id": 456, "descricao": null }
}
```

#### Estoque

```http
# Estoque de um produto
GET /estoques/{idProduto}

# Estoque em lote (OBRIGATÓRIO usar lotes de 50)
GET /estoques?idsProdutos[]=123&idsProdutos[]=456&idsProdutos[]=789
```

**ATENÇÃO:** A API de listagem de produtos NÃO retorna estoque.
Fazer chamada separada à API de estoques, em lotes de até 50 IDs.

```typescript
async function getEstoquesEmLote(ids: number[]): Promise<EstoqueMap> {
  const resultado: EstoqueMap = {};
  
  // Dividir em lotes de 50
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const params = lote.map(id => `idsProdutos[]=${id}`).join('&');
    
    const resp = await blingRequest(`/estoques?${params}`);
    resp.data.forEach((e: any) => {
      resultado[e.produto.id] = e.saldoVirtualTotal;
    });
    
    // Rate limit: 3 req/s
    await delay(350);
  }
  
  return resultado;
}
```

#### Pedidos

```http
# Listar pedidos (NÃO retorna itens)
GET /pedidos/vendas?pagina=1&limite=100&dataInicial=2026-01-01&dataFinal=2026-12-31

# Buscar pedido com itens
GET /pedidos/vendas/{id}

# Criar pedido no Bling
POST /pedidos/vendas

# Atualizar situação
PATCH /pedidos/vendas/{id}/situacoes
```

**ATENÇÃO:** Listagem de pedidos NÃO inclui itens.
Para itens, buscar individualmente por ID.

**Criar pedido no Bling a partir de pedido Medusa:**
```json
{
  "numero": "MEDUSA-123",
  "loja": { "id": ID_LOJA_BLING },
  "data": "2026-04-01",
  "contato": {
    "nome": "Nome do Cliente",
    "email": "cliente@email.com",
    "documento": "CPF_CLIENTE",
    "telefone": "47999999999",
    "endereco": {
      "endereco": "Rua do Cliente",
      "numero": "123",
      "bairro": "Bairro",
      "municipio": "Cidade",
      "uf": "UF",
      "cep": "00000000",
      "pais": "Brasil"
    }
  },
  "itens": [
    {
      "codigo": "LP-FAB-SPARK-12",
      "descricao": "LAPIS 12 CORES FABER CASTELL SPARKLE PASTEL",
      "quantidade": 1,
      "valor": 59.90,
      "desconto": 0
    }
  ],
  "parcelas": [
    {
      "valor": 59.90,
      "formaPagamento": { "id": ID_FORMA_PIX }
    }
  ],
  "transporte": {
    "transportadora": { "nome": "Melhor Envio" },
    "volumes": [
      {
        "peso": 0.3,
        "altura": 5,
        "largura": 15,
        "comprimento": 20
      }
    ]
  }
}
```

#### Situações de pedido

| Código | Situação |
|---|---|
| 6 | Em Aberto |
| 9 | Atendido |
| 12 | Cancelado |
| 15 | Em andamento |

#### Webhook Bling

```
URL: https://api.papelariabibelo.com.br/webhooks/bling
Validação: X-Bling-Signature-256: sha256=HASH
Secret: client_secret da aplicação Bling
```

**Eventos disponíveis:**
- `produto` → criado, atualizado, excluído
- `estoque` → atualizado
- `pedido` → criado, atualizado
- `contato` → criado, atualizado

**Validar webhook:**
```typescript
function validateBlingWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = 'sha256=' +
    crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}
```

#### Categorias

```http
GET /categorias/produtos
GET /categorias/produtos/{id}
```

**ATENÇÃO:** Produto retornado na listagem tem `categoria.descricao: null`.
Para nome da categoria, buscar separadamente.

---

## 4. Fluxo completo de um pedido

```
CLIENTE                    STOREFRONT (Next.js)         MEDUSA               BLING              MELHOR ENVIO
   │                              │                        │                    │                     │
   │── Adiciona ao carrinho ──────►                        │                    │                     │
   │                              │── POST /store/carts ──►│                    │                     │
   │                              │                        │                    │                     │
   │── Escolhe frete ─────────────►                        │                    │                     │
   │                              │── POST /calculate ─────┼────────────────────┼────► GET /calculate │
   │                              │◄─ opções de frete ──────┼────────────────────┼─────               │
   │                              │                        │                    │                     │
   │── Finaliza compra ───────────►                        │                    │                     │
   │                              │── POST /store/orders ─►│                    │                     │
   │                              │                        │── POST /pagamentos ►MP                   │
   │◄─ QR Code Pix / Form cartão ──                        │                    │                     │
   │                              │                        │                    │                     │
   │── Paga ──────────────────────────────────────────────────────────── Webhook MP ──────────────────►│
   │                              │                        │◄── payment.updated │                     │
   │                              │                        │── atualiza order ──►                     │
   │                              │                        │── POST pedido ──────► Bling              │
   │                              │                        │                    │── webhook estoque ──►│
   │◄─ Email confirmação ─────────                         │                    │                     │
   │                              │                        │── POST carrinho ME ─┼────────────────────► ME
   │                              │                        │── checkout ME ──────┼─────────────────────►
   │                              │                        │── gera etiqueta ────┼─────────────────────►
   │◄─ Email com rastreio ────────                         │                    │                     │
```

---

## 5. Variáveis de ambiente necessárias

Adicionar ao `/opt/bibelocrm/.env`:

```bash
# ── Mercado Pago ──────────────────────────────────────────
MP_ACCESS_TOKEN=APP_USR-...
MP_PUBLIC_KEY=APP_USR-...
MP_WEBHOOK_SECRET=...
MP_SANDBOX=false

# ── Melhor Envio ──────────────────────────────────────────
ME_CLIENT_ID=...
ME_CLIENT_SECRET=...
ME_REDIRECT_URI=https://api.papelariabibelo.com.br/callbacks/melhorenvio
ME_SANDBOX=false
# Tokens salvos no banco (sync.sync_state), não no .env

# ── Bling (já existentes, confirmar) ──────────────────────
BLING_CLIENT_ID=...
BLING_CLIENT_SECRET=...
BLING_WEBHOOK_SECRET=...
# Tokens OAuth salvos no banco (sync.sync_state)

# ── Loja (dados de origem do frete) ───────────────────────
STORE_CEP=89093880
STORE_NOME=Papelaria Bibelô
STORE_CNPJ=63961764000163
STORE_EMAIL=contato@papelariabibelo.com.br
STORE_TELEFONE=47933862514

# ── Medusa ────────────────────────────────────────────────
MEDUSA_JWT_SECRET=...    # mín 32 chars aleatórios
MEDUSA_COOKIE_SECRET=... # mín 32 chars aleatórios
```

---

## 6. Segurança e boas práticas

### Rate limits

| API | Limite | Estratégia |
|---|---|---|
| Bling | 3 req/s | delay 350ms entre chamadas |
| Mercado Pago | sem limite documentado | retry exponencial em 429 |
| Melhor Envio | sem limite documentado | retry em 429/500 |

### Padrão de retry

```typescript
async function apiCallWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      if (err.status === 429) {
        const retryAfter = parseInt(err.headers?.['retry-after'] ?? '60');
        await delay(retryAfter * 1000);
      } else {
        await delay(delayMs * attempt); // exponential backoff
      }
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Idempotência

Mercado Pago suporta `X-Idempotency-Key`. Usar UUID por transação para evitar
cobranças duplicadas em caso de timeout:

```typescript
const payment = await mpClient.post('/v1/orders', body, {
  headers: { 'X-Idempotency-Key': `BIBELO-${orderId}-${Date.now()}` }
});
```

### Logs obrigatórios

Logar sempre (sem dados sensíveis):
- Início e fim de cada chamada de API
- Status HTTP retornado
- ID da transação/pedido
- Tempo de resposta

Nunca logar:
- `access_token`
- Dados de cartão
- CPF completo (logar apenas últimos 4 dígitos)

### Ordem de integração recomendada

```
Fase 1: Mercado Pago (checkout transparente — Pix primeiro)
Fase 2: Melhor Envio (cálculo de frete no carrinho)
Fase 3: Bling → Medusa (sync de produtos e estoque)
Fase 4: Bling ← Medusa (criar pedido no Bling após pagamento)
Fase 5: Melhor Envio automático (gerar etiqueta após pagamento confirmado)
Fase 6: Webhooks bidirecionais completos
```

---

*Papelaria Bibelô — Ecossistema de Integrações*
*Gerado em Abril/2026 — Revisar a cada 6 meses ou em mudanças de versão de API*