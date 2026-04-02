# Integração Bling → Medusa — Sync de Produtos para o E-commerce

> Pipeline de dados: Bling (fonte da verdade) → BibelôCRM (hub) → Medusa (e-commerce) → Storefront
> Data: 1 de abril de 2026

---

## 1. Visão geral

O Bling funciona como ERP e fonte da verdade para produtos, categorias, estoque e imagens.
O Medusa é o motor e-commerce headless (carrinho, pedidos, pagamento, frete).
O BibelôCRM opera como **hub central**, orquestrando o sync entre os dois.

### Como as integrações oficiais funcionam

O Bling já possui integrações nativas com NuvemShop, Shopee, Mercado Livre e WooCommerce.
Todas seguem o mesmo padrão:

```
Bling (produtos, estoque, preços, imagens)
    │
    ├── Canal de Venda registrado (GET /canais-venda)
    ├── Categorias mapeadas (POST /categorias/lojas)
    ├── Produtos vinculados (POST /produtos/lojas)
    │
    ├── Webhooks (product.*, stock.*, order.*)
    │       │
    │       ▼
    │   Listener → atualiza loja virtual em real-time
    │
    └── Sync incremental → atualiza em lotes periódicos
          │
          ▼
      Loja virtual (NuvemShop, Shopee, etc.)
```

**Nossa integração Bling → Medusa segue o mesmo modelo**, implementada no BibelôCRM.

---

## 2. O que já temos (implementado)

### 2.1 OAuth2 completo
- **Arquivo:** `api/src/integrations/bling/auth.ts`
- Fluxo authorization_code + auto-refresh
- Tokens em `sync.sync_state` (key: `bling`)
- Variáveis: `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`, `BLING_REDIRECT_URI`

### 2.2 Sync Bling → banco local (a cada 30min)
- **Arquivo:** `api/src/integrations/bling/sync.ts`
- **Agenda:** BullMQ `*/30 * * * *` (`api/src/queues/sync.queue.ts`)
- **Dados sincronizados:**

| Recurso | Endpoint Bling | Tabela local | Campos-chave |
|---------|---------------|-------------|-------------|
| Produtos | `GET /produtos` | `sync.bling_products` | nome, sku, preço, categoria, **imagens (JSON)**, ativo, peso, gtin |
| Categorias | `GET /categorias/produtos` | Mapeadas em `bling_products.categoria` | descricao, id → nome da categoria |
| Estoque | `GET /estoques/saldos` | `sync.bling_stock` | saldo_fisico, saldo_virtual por depósito |
| Pedidos | `GET /pedidos/vendas` | `sync.bling_orders` | numero, valor, status, canal, itens |
| Clientes | `GET /contatos` | `sync.bling_customers` → `crm.customers` | nome, email, telefone, cpf |

### 2.3 Sync banco local → Medusa (a cada 30min, offset +5min)
- **Arquivo:** `api/src/integrations/medusa/sync.ts`
- **Agenda:** BullMQ `5,35 * * * *`
- **Dedup:** SKU é a chave — se existe no Medusa → update, senão → create
- **O que faz hoje:**
  - ✅ Cria/atualiza produtos (título, handle, preço em BRL, SKU, GTIN, peso)
  - ✅ Define status (published se estoque > 0, draft se = 0)
  - ✅ Salva metadata (bling_id, preco_custo, categoria_bling)
  - ✅ Atribui ao sales channel padrão

### 2.4 Imagens do Bling (já extraídas)
- **No sync:** `midia.imagens.internas` + `midia.imagens.externas` → salvas em `bling_products.imagens` (JSONB)
- **Editor de Imagens:** `api/src/routes/images.ts` — converte fotos e envia ao Bling via `PATCH /produtos/{id}`
- **Fluxo do Editor:** Upload → Sharp (resize, fundo branco) → URL temporária → `PATCH imagensURL` → Bling processa

### 2.5 Webhooks Bling (real-time)
- **Arquivo:** `api/src/integrations/bling/webhook.ts`
- **Endpoint:** `POST /api/webhooks/bling`
- **Validação:** HMAC-SHA256 (`X-Bling-Signature-256`) + idempotência (60s cache)
- **Eventos tratados:** `contato.*`, `order.*`, `stock.*`

### 2.6 Rate limiting
- **Limite Bling:** 3 req/s (global por conta)
- **Implementação:** Mutex serial + 350ms delay entre chamadas
- **Retry:** Exponential backoff (5s, 10s, 20s) + respeita header `Retry-After`

---

## 3. O que falta (gaps para o storefront)

| Gap | Impacto | Prioridade |
|-----|---------|-----------|
| **Categorias no Medusa** | 0 categorias criadas — produtos sem organização | P0 |
| **Imagens no Medusa** | URLs do Bling salvas no banco mas não enviadas ao Medusa na criação | P0 |
| **Estoque (inventory) no Medusa** | `manage_inventory: false` em todas as variantes — sem controle | P1 |
| **Coleções no Medusa** | 0 coleções — home page sem "Novidades", "Promoções" | P1 |
| **Webhook product.updated → Medusa** | Hoje só sync a cada 30min, sem real-time | P2 |
| **Variações de produto** | Cada variação cria produto separado no Medusa (deveria ser variant) | P2 |
| **Canal de venda formal** | Medusa não registrado como loja no Bling (`/produtos/lojas`) | P3 |

---

## 4. Endpoints Bling relevantes

### 4.1 Produtos

| Método | Endpoint | Uso |
|--------|----------|-----|
| `GET /produtos` | Lista paginada (filtros: nome, tipo, dataAlteracao, idCategoria) | Sync incremental |
| `GET /produtos/{id}` | Detalhe completo (com imagens, variações) | Webhook trigger |
| `PATCH /produtos/{id}` | Atualiza parcial (imagens via `midia.imagens.imagensURL`) | Editor de imagens |

### 4.2 Categorias de produtos

| Método | Endpoint | Uso |
|--------|----------|-----|
| `GET /categorias/produtos` | Lista todas (paginada) | Sync de categorias |
| `GET /categorias/produtos/{id}` | Detalhe (com `categoriaPai`) | Hierarquia |

**Estrutura da categoria:**
```typescript
{
  id: number
  descricao: string       // nome da categoria
  categoriaPai?: { id: number }  // hierarquia (subcategorias)
}
```

### 4.3 Categorias de lojas (mapeamento)

| Método | Endpoint | Uso |
|--------|----------|-----|
| `GET /categorias/lojas` | Lista vínculos categoria ↔ loja | Consultar mapeamento |
| `POST /categorias/lojas` | Cria vínculo | Registrar categorias Medusa |

```typescript
{
  loja: { id: number }           // ID da loja no Bling
  descricao: string              // nome na loja virtual
  codigo: string                 // código na loja (ex: handle Medusa)
  categoriaProduto: { id: number }  // categoria Bling vinculada
}
```

### 4.4 Produtos-lojas (vínculo produto ↔ loja)

| Método | Endpoint | Uso |
|--------|----------|-----|
| `GET /produtos/lojas` | Lista vínculos | Consultar |
| `POST /produtos/lojas` | Cria vínculo | Registrar produto no Medusa |

```typescript
{
  codigo: string                  // código do produto na loja (SKU ou handle Medusa)
  preco: number                   // preço específico para esta loja
  precoPromocional: number        // preço promocional
  produto: { id: number }        // ID do produto no Bling
  loja: { id: number }           // ID da loja no Bling
  categoriasProdutos: [{ id: number }]  // categorias do produto nesta loja
}
```

### 4.5 Estoque

| Método | Endpoint | Uso |
|--------|----------|-----|
| `GET /estoques/saldos` | Saldos (requer `idsProdutos[]`, máx 50) | Sync de estoque |

### 4.6 Canais de venda

| Método | Endpoint | Uso |
|--------|----------|-----|
| `GET /canais-venda` | Lista canais | Verificar se Medusa está registrado |

### 4.7 Imagens (dentro do produto)

**Leitura** (ao buscar produto):
```typescript
produto.midia.imagens = {
  internas: [{ link, linkMiniatura, validade, ordem }],  // readOnly — hospedadas no S3 Bling
  externas: [{ link }]                                    // readOnly — URLs externas
}
produto.imagemURL  // readOnly — primeira imagem
```

**Escrita** (ao criar/atualizar produto):
```typescript
// PATCH /produtos/{id}
{
  midia: {
    imagens: {
      imagensURL: [{ link: "https://url-publica/imagem.jpg" }]  // writeOnly
    }
  }
}
```

**Comportamento:**
- `PATCH imagensURL: [{link}]` → **adiciona** às imagens existentes
- `PATCH imagensURL: []` → **limpa todas** as imagens
- Para **substituir**: primeiro PATCH com `[]`, depois PATCH com novas URLs

---

## 5. Webhooks Bling

### Eventos disponíveis

| Scope | Eventos | Webhook |
|-------|---------|---------|
| `product` | `product.created`, `product.updated`, `product.deleted` | ✅ Disponível |
| `stock` | `stock.created`, `stock.updated`, `stock.deleted` | ✅ Disponível |
| `order` | `order.created`, `order.updated`, `order.deleted` | ✅ Já implementado |
| `contact` | `contato.created`, `contato.updated` | ✅ Já implementado |

**Não existe webhook para:**
- Alteração de categorias
- Alteração de imagens (detectar via `product.updated`)

### Payload

```json
{
  "eventId": "uuid",
  "date": "2026-04-01T10:00:00Z",
  "event": "product.updated",
  "companyId": 123456,
  "data": { "id": 789 }
}
```

### Validação HMAC
- Header: `X-Bling-Signature-256: sha256=<hex>`
- Secret: `client_secret` do app
- Já implementado em `webhook.ts` com `timingSafeEqual`

### Regras
- Timeout: 5s para resposta
- Retry: até 3 dias com intervalos progressivos
- Se falhar: webhook **desativado** (requer reativação manual)
- **Sem garantia de ordem** dos eventos

---

## 6. Rate limits

| Limite | Valor |
|--------|-------|
| Requisições por segundo | **3** |
| Requisições por dia | **120.000** |
| 300 erros em 10s | Bloqueio IP 10 min |
| 600 requests em 10s | Bloqueio IP 10 min |
| Paginação máxima | 100 registros/página |
| Filtro de data máximo | 1 ano |

**Nossa implementação:** mutex serial com 350ms entre chamadas (≈ 2,8 req/s) — dentro do limite.

---

## 7. Plano de implementação: Sync completo Bling → Medusa

### Fase 0A — Sync de categorias (P0)

**O que:** Criar categorias do Bling no Medusa, mantendo mapeamento.

**Fluxo:**
```
1. GET /categorias/produtos (Bling) → lista completa com hierarquia
2. Para cada categoria:
   a. Verificar se já existe no Medusa (por metadata.bling_category_id)
   b. Se não → POST /admin/product-categories (Medusa)
   c. Se sim → POST /admin/product-categories/{id} (update)
3. Subcategorias: usar parent_category_id no Medusa (espelhar categoriaPai do Bling)
4. Salvar mapeamento bling_id → medusa_id em tabela auxiliar
```

**Tabela nova:** `sync.bling_medusa_categories`
```sql
CREATE TABLE sync.bling_medusa_categories (
  bling_category_id VARCHAR(50) PRIMARY KEY,
  medusa_category_id VARCHAR(100) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  bling_parent_id VARCHAR(50),
  sincronizado_em TIMESTAMPTZ DEFAULT NOW()
);
```

**Modificar:** `medusa/sync.ts` → ao criar/atualizar produto, atribuir `categories: [{ id: medusa_id }]`

### Fase 0B — Sync de imagens (P0)

**O que:** Enviar URLs de imagens do Bling ao Medusa ao criar/atualizar produtos.

**Estado atual:** `sync.bling_products.imagens` já contém as URLs (JSONB com `url` e `ordem`).
O `medusa/sync.ts` já tenta enviar imagens na criação (`body.images = images`), mas:
1. As URLs do Bling (S3 da Bling) podem ter expiração (assinatura AWS)
2. No update, **não atualiza imagens** — só título, preço, status

**Solução:**
```
1. Na criação: enviar images: [{url}] como já faz (funciona se URL não expirou)
2. No update: comparar imagens atuais com as do Bling, atualizar se mudaram
3. Para URLs com expiração: proxy via api.papelariabibelo.com.br/api/images/proxy?url=
4. Alternativa: baixar imagem do Bling e fazer upload direto ao Medusa
```

**Modificar:** `medusa/sync.ts` → `updateMedusaProduct()` incluir lógica de imagens

### Fase 0C — Estoque real no Medusa (P1)

**O que:** Ativar `manage_inventory: true` e criar inventory levels.

**Estado atual:** Todas as variantes com `manage_inventory: false`. Estoque salvo em `sync.bling_stock` mas não propagado ao Medusa.

**Fluxo:**
```
1. Para cada produto no Medusa:
   a. Buscar variante
   b. POST /admin/inventory-items (se não existe)
   c. POST /admin/inventory-levels (associar ao stock location)
   d. Atualizar quantidade: POST /admin/inventory-levels/{id}/adjust
2. No sync periódico: comparar bling_stock com Medusa, ajustar diferenças
```

### Fase 0D — Coleções (P1)

**O que:** Criar "Novidades", "Mais Vendidos", "Promoções" no Medusa.

**Critérios:**
- **Novidades:** Produtos criados nos últimos 30 dias no Bling
- **Mais Vendidos:** Top 20 por quantidade vendida (`sync.bling_orders.itens`)
- **Promoções:** Produtos com preço promocional (quando implementado)

**Execução:** Job periódico no BullMQ que recalcula e atualiza as coleções.

### Fase 0E — Webhook product.updated → Medusa (P2)

**O que:** Quando o Bling envia `product.updated`, atualizar no Medusa em real-time.

**Modificar:** `webhook.ts` → adicionar handler para `product.*`:
```typescript
case "product.updated":
case "product.created":
  // 1. GET /produtos/{id} no Bling (buscar dados completos)
  // 2. Upsert em sync.bling_products
  // 3. Disparar sync individual para o Medusa
  break;
case "product.deleted":
  // 1. Marcar como inativo em sync.bling_products
  // 2. Mudar status para draft no Medusa
  break;
```

### Fase 0F — Variações de produto (P2)

**O que:** Mapear variações do Bling para variants do Medusa.

**Bling:** Produto com `formato: 'V'` tem campo `variacoes[]`, cada uma com `variacao.nome: "Tamanho:G;Cor:Verde"`.

**Medusa:** Produto com `options: [{title: "Tamanho", values: ["P", "M", "G"]}]` e `variants` vinculados.

**Hoje:** Cada variação é criada como produto separado no Medusa (com SKU único). Para corrigir:
1. Detectar `formato === 'V'` no Bling
2. Agrupar variações pelo `produtoPai.id`
3. Criar produto único no Medusa com múltiplas variants
4. Parsear `variacao.nome` para extrair options (split por `;`, key:value)

### Fase 0G — Canal de venda formal (P3, opcional)

**O que:** Registrar o Medusa como "loja" no Bling via `/produtos/lojas`.

**Benefício:** Permite preço diferenciado por canal, estoque dedicado, relatórios no Bling.

**Limitação:** Bling não tem tipo "Medusa" nativo. Pode-se usar tipo "API" ou "Loja Virtual".

---

## 8. Arquitetura final do sync

```
┌─────────────────────────────────────────────────────────────┐
│                    BLING ERP (fonte da verdade)              │
│  Produtos · Categorias · Estoque · Imagens · Pedidos        │
└────────────────────────┬────────────────────────────────────┘
                         │
           ┌─────────────┼──────────────┐
           │             │              │
     Webhook          Sync 30min     Editor CRM
   (real-time)      (incremental)   (imagens)
           │             │              │
           ▼             ▼              │
┌──────────────────────────────────┐    │
│       BibelôCRM (hub central)    │◄───┘
│                                  │
│  sync.bling_products    (JSONB)  │
│  sync.bling_stock       (saldos) │
│  sync.bling_orders      (itens)  │
│  sync.bling_customers   (dados)  │
│  sync.bling_medusa_categories    │  ← NOVO
│                                  │
│  BullMQ: sync a cada 30min      │
│  Webhook: real-time updates      │
└────────────────────┬─────────────┘
                     │
               Sync → Medusa
              (30min ou webhook)
                     │
                     ▼
┌──────────────────────────────────┐
│       Medusa.js (e-commerce)     │
│                                  │
│  Produtos    (com imagens)       │
│  Categorias  (hierárquicas)      │  ← NOVO
│  Coleções    (Novidades, etc.)   │  ← NOVO
│  Inventory   (estoque real)      │  ← NOVO
│  Variantes   (cor, tamanho)      │  ← MELHORAR
│  Carrinho, Pedidos, Pagamento    │
│  Frete (Melhor Envio)            │
└────────────────────┬─────────────┘
                     │
                     ▼
┌──────────────────────────────────┐
│    Next.js Storefront (vitrine)  │
│                                  │
│  SSG/ISR → catálogo (SEO)        │
│  SSR → carrinho/checkout         │
│  Consume Medusa Store API        │
└──────────────────────────────────┘
```

---

## 9. Fluxo reverso: Medusa → Bling

| Evento no Medusa | Ação no Bling |
|-----------------|---------------|
| Pedido pago | `POST /pedidos/vendas` — criar pedido de venda |
| Pedido enviado | Atualizar status + gerar NF-e |
| Estoque ajustado (devolução) | `POST /estoques` — entrada de estoque |

**Já implementado:**
- Medusa → Bling pedido: sim (Fase 4, commit `24d4520`)
- Medusa → etiqueta Melhor Envio: sim (Fase 5, commit `92889db`)

---

## 10. Referências

### Documentação interna
- `docs/integracoes/bling-referencia.md` — resumo da API v3
- `docs/integracoes/bling-openapi.json` — OpenAPI 3.0 spec completo (1 MB)
- `docs/integracoes/status.md` — status de todas as integrações

### Documentação oficial Bling
- Portal: https://developer.bling.com.br
- Referência API: https://developer.bling.com.br/referencia
- Webhooks: https://developer.bling.com.br/webhooks
- Autenticação: https://developer.bling.com.br/bling-api
- Limites: https://developer.bling.com.br/limites
- Boas práticas: https://developer.bling.com.br/boas-praticas
- Homologação (app público): https://developer.bling.com.br/homologacao

### Código-fonte
- OAuth: `api/src/integrations/bling/auth.ts`
- Sync Bling: `api/src/integrations/bling/sync.ts`
- Webhooks: `api/src/integrations/bling/webhook.ts`
- Sync Medusa: `api/src/integrations/medusa/sync.ts`
- Editor imagens: `api/src/routes/images.ts`
- Fila BullMQ: `api/src/queues/sync.queue.ts`

---

*Documento de integração Bling ↔ Medusa — Papelaria Bibelô*
*Criado em 1 de abril de 2026*
