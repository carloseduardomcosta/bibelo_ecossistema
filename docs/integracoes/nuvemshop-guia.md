# NuvemShop API — Guia de Integração ERP

> Fonte: https://dev.tiendanube.com/docs/erp-guide/overview
> Salvo em: 2026-03-28
> Uso: referência para integração BibelôCRM ↔ NuvemShop

---

## 1. Visão Geral

Guia prático para integrar sistemas ERP/CRM com a plataforma NuvemShop, cobrindo:

- **Gestão de produtos e variações**: Cadastro, atualização e controle de inventário
- **Sincronização de pedidos**: Processamento automatizado via webhooks
- **Gestão de estoque e notas fiscais**: Controle de níveis e emissão de documentos

### Estrutura

| Seção | Objetivo |
|-------|----------|
| 1. Criação de Aplicação | Perfil de parceiro e conexão com plataforma |
| 2. Instalação e Onboarding | Experiência eficiente para apps públicas |
| 3. Stocks e Depósitos | Gestão multi-armazém |
| 4. Produtos e Variações | Sincronização completa de catálogo |
| 5. Pedidos | Captura e gestão de transações |
| 6. Clientes | Sincronização de dados de usuários |
| 7. Recursos Adicionais | Boas práticas e ferramentas |
| 8. Checklist de Homologação | Validação para App Store |

---

## 2. Autenticação OAuth 2.0

### Fluxo de Autorização (Authorization Code Grant)

NuvemShop implementa OAuth 2.0 com tokens que **NÃO expiram** até desinstalação ou renovação.

#### Passos do Fluxo:

1. **Início da Instalação** — Usuário acessa do painel admin da NuvemShop ou URL direta de autorização
2. **Solicitação de Permissões (Scopes)** — Usuário autoriza os escopos solicitados
3. **Redirecionamento com Código** — Código de autorização **expira em 5 minutos**
4. **Troca por Token de Acesso** — App usa credenciais + código para obter token permanente

#### Endpoint:

```
POST https://www.nuvemshop.com/apps/authorize/token
```

#### cURL — Obter Token:

```bash
curl -d '{"client_id": "123","client_secret": "abcdef","grant_type": "authorization_code","code": "xyz"}' \
  -H 'Content-Type: application/json' \
  -X POST "https://www.nuvemshop.com/apps/authorize/token"
```

#### Parâmetros do Request:

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `client_id` | string | Sim | ID da aplicação |
| `client_secret` | string | Sim | Secret da aplicação |
| `grant_type` | string | Sim | Valor: `authorization_code` |
| `code` | string | Sim | Código de autorização recebido (válido 5 min) |

#### Response:

```json
{
  "access_token": "token_value",
  "token_type": "Bearer",
  "user_id": 5665778
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `access_token` | string | Token para autenticar requisições API |
| `token_type` | string | Tipo de token (sempre "Bearer") |
| `user_id` | integer | ID da loja (store_id) |

#### Validade do Token:

- **Expiração**: Nunca expira automaticamente
- **Revogação**: Somente se:
  - Usuário desinstala a aplicação
  - Token é renovado explicitamente
  - Usuário revoga manualmente permissões

#### Uso em Requisições:

```bash
-H 'Authentication: bearer {{app_token}}'
```

---

## 3. Rate Limit — Controle de Uso da API

### Algoritmo: Leaky Bucket

#### Limites Padrão:

- **Capacidade do bucket**: 40 requisições
- **Taxa de filtragem**: 2 requisições por segundo
- **Permitido sem erro 429**: 2 req/seg em pacotes de até 40

#### Para Planos Superiores (Next/Evolution):

- Limite multiplicado por **10**
- Capacidade: 400 requisições
- Taxa: 20 requisições por segundo

#### Aplicação do Limite:

- **Individual por loja**
- **Individual por aplicação**
- Não compartilhado entre múltiplas stores ou apps

### Headers de Monitoramento

```
x-rate-limit-limit: 40
x-rate-limit-remaining: 35
x-rate-limit-reset: 5000
```

| Header | Descrição |
|--------|-----------|
| `x-rate-limit-limit` | Total de requisições no período |
| `x-rate-limit-remaining` | Requisições restantes antes de encher o bucket |
| `x-rate-limit-reset` | Milissegundos para esvaziar o bucket completamente |

### Manejo de Erros

**Código 429 - Too Many Requests:**
- Esperar tempo indicado em `x-rate-limit-reset`
- Implementar retry exponencial

---

## 4. Paginação e Filtros Gerais

### Parâmetros de Paginação

```bash
GET https://api.nuvemshop.com/v1/{{store_id}}/products?page=2&per_page=50
```

| Parâmetro | Tipo | Range | Descrição |
|-----------|------|-------|-----------|
| `page` | integer | ≥ 1 | Número da página (default: 1) |
| `per_page` | integer | 1-200 | Elementos por página (default: 25) |

### Headers de Resposta:

```
x-total-count: 156
Link: <https://api.nuvemshop.com/v1/stores/123/products?page=2&per_page=50>; rel="next", <...>; rel="prev"
```

| Header | Descrição |
|--------|-----------|
| `x-total-count` | Quantidade total de elementos disponíveis |
| `Link` | URLs para páginas seguinte e anterior (RFC 5988) |

### Filtros Comuns em Listados:
- `created_at_min` — Data mínima (ISO 8601)
- `created_at_max` — Data máxima (ISO 8601)
- `status` — Filtro por estado
- `limit` — Número máximo de resultados

### Exemplo Completo:

```bash
# Primeira página (25 elementos)
curl -X GET https://api.nuvemshop.com/v1/{{store_id}}/products \
  -H 'Authentication: bearer {{app_token}}' \
  -H 'User-Agent: Your App Name ({{app_id}})' \
  -H 'Content-Type: application/json'

# Segunda página (50 elementos por página)
curl -X GET 'https://api.nuvemshop.com/v1/{{store_id}}/products?page=2&per_page=50' \
  -H 'Authentication: bearer {{app_token}}' \
  -H 'User-Agent: Your App Name ({{app_id}})' \
  -H 'Content-Type: application/json'
```

---

## 5. Gestão de Estoque (Locations / Depósitos)

### Limites por Plano

| Plano | Depósitos Permitidos |
|-------|---------------------|
| Freemium / Plano A | 1 depósito |
| Plano B | 2 depósitos |
| Plano C | 3 depósitos |
| Enterprise | Ilimitado |

### 5.1 Criar Novo Depósito

```
POST /v1/{{store_id}}/locations
```

```bash
curl -X POST https://api.nuvemshop.com/v1/{{store_id}}/locations \
  -H 'Authentication: bearer {{app_token}}' \
  -H 'User-Agent: Your App Name ({{app_id}})' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": {
      "es_AR": "Nombre del stock",
      "pt_BR": "Nome do estoque",
      "en_US": "Stock name"
    },
    "address": {
      "zipcode": "12910802",
      "street": "Rua Exemplo",
      "number": "123",
      "floor": "1º Andar",
      "locality": "Bairro Exemplo",
      "city": "São Paulo",
      "province": { "code": "SP", "name": "São Paulo" },
      "region": { "code": "SE", "name": "Sudeste" },
      "country": { "code": "BR", "name": "Brasil" },
      "reference": "Ponto de referência",
      "between_streets": "Entre a Rua A e Rua B"
    },
    "is_default": false,
    "allows_pickup": true,
    "priority": 1
  }'
```

#### Campos do Request:

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | object | Sim | Nome multi-idioma do depósito |
| `name.pt_BR` | string | Não | Nome em português |
| `address` | object | Sim | Endereço do depósito |
| `address.zipcode` | string | Sim | CEP |
| `address.street` | string | Sim | Nome da rua |
| `address.number` | string | Sim | Número |
| `address.floor` | string | Não | Andar/Apartamento |
| `address.locality` | string | Sim | Bairro |
| `address.city` | string | Sim | Cidade |
| `address.province` | object | Sim | Estado (code + name) |
| `address.country` | object | Sim | País (code + name) |
| `address.reference` | string | Não | Ponto de referência |
| `address.between_streets` | string | Não | Entre quais ruas |
| `is_default` | boolean | Não | É depósito padrão? (default: false) |
| `allows_pickup` | boolean | Não | Permite retirada? (default: false) |
| `priority` | integer | Não | Prioridade para processamento de pedidos |

#### Response (201 Created):

```json
{
  "id": "01HTMFDH09VC6E2Q8KGTGP44D3",
  "name": { "pt_BR": "Nome do estoque" },
  "address": { ... },
  "is_default": false,
  "allows_pickup": true,
  "priority": 1,
  "created_at": "2023-01-15T10:30:00Z",
  "updated_at": "2023-01-15T10:30:00Z"
}
```

| Código | Descrição |
|--------|-----------|
| 201 | Depósito criado com sucesso |
| 400 | Request inválido (campos faltando) |
| 401 | Não autorizado (token inválido) |
| 422 | Dados não processáveis (validação falhou) |

### 5.2 Atualizar Depósito

```
PUT /v1/{{store_id}}/locations/{id}
```

Payload: mesmo da criação, todos os campos opcionais. Só incluir campos a atualizar.

### 5.3 Listar Todos os Depósitos

```
GET /v1/{{store_id}}/locations
```

Suporta paginação (`page`, `per_page`).

### 5.4 Modificar Prioridades

```
PATCH /v1/{{store_id}}/locations/priorities
```

```json
[
  { "id": "01HTMFDH09VC6E2Q8KGTGP44D3", "priority": 0 },
  { "id": "01HTMFFHWXRC8TRS40M43XGQFB", "priority": 1 }
]
```

> A priorização do estoque impacta diretamente na cotação de frete da loja. Os estoques priorizados são considerados ao montar o pacote, definindo a origem do envio e afetando custos de transporte, tempos de entrega e experiência do cliente.

### 5.5 Definir Depósito como Padrão

```
PATCH /v1/{{store_id}}/locations/{id}/chosen-as-default
```

Body vazio. Response retorna o depósito com `is_default: true`.

---

## 6. Gestão de Catálogo

### 6.1 Categorias

> Para lojas mono-idioma, basta enviar `"name": "Eletrônicos"` (sem objeto multi-idioma).

#### 6.1.1 Criar Categoria

```
POST /v1/{{store_id}}/categories
```

```bash
curl -X POST https://api.nuvemshop.com/v1/{{store_id}}/categories \
  -H "Content-Type: application/json" \
  -H "Authentication: bearer {{app_token}}" \
  -H "User-Agent: Your App Name ({{app_id}})" \
  -d '{
    "name": { "pt": "Eletrônicos" },
    "description": { "pt": "Categoria de produtos eletrônicos" },
    "handle": { "pt": "eletronicos" },
    "parent": null,
    "google_shopping_category": "Clothing & Accessories > Jewelry",
    "seo_title": "Produtos eletrônicos",
    "seo_description": "Categoria de produtos eletrônicos"
  }'
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | object/string | Sim | Nome (multi-idioma ou simples) |
| `description` | object/string | Não | Descrição |
| `handle` | object/string | Não | URL-friendly slug |
| `parent` | integer/null | Não | ID categoria pai (para subcategorias) |
| `google_shopping_category` | string | Não | Categoria Google Shopping |
| `seo_title` | string | Não | Título SEO |
| `seo_description` | string | Não | Descrição SEO |

#### 6.1.2 Criar Subcategoria

Mesmo endpoint, com `"parent": 12345` (ID da categoria pai).

#### 6.1.3 Atualizar Categoria

```
PUT /v1/{{store_id}}/categories/{id}
```

### 6.2 Produtos

#### Tipos de Produtos:

1. **Sem Variação**: Simples, SKU único (ex: um livro, um póster)
2. **Com Variação**: Opções de seleção (ex: camiseta com tamanho e cor)

#### Conceitos:
- **Atributos**: Opções disponíveis (ex: Tamanho, Cor)
- **Valores**: Opções dentro do atributo (ex: P, M, G, GG)
- **Variantes**: Combinação específica de valores (ex: Tamanho M + Cor Azul)

#### 6.2.1 Criar Produto

```
POST /v1/{{store_id}}/products
```

```bash
curl -X POST https://api.nuvemshop.com/v1/{{store_id}}/products \
  -H 'Authentication: bearer {{app_token}}' \
  -H 'User-Agent: Your App Name ({{app_id}})' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Camiseta básica",
    "description": "Camiseta 100% algodão",
    "price": 49.99,
    "sku": "CAM-001",
    "stock": 0,
    "inventory_levels": [
      {
        "location_id": "01GQ2ZHK064BQRHGDB7CCV0Y6N",
        "stock": 5
      }
    ],
    "categories": [12345],
    "images": []
  }'
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | Sim | Nome do produto |
| `description` | string | Não | Descrição detalhada |
| `price` | decimal | Não | Preço do produto |
| `sku` | string | Não | Código SKU identificador |
| `stock` | integer | Não | Estoque geral (deprecated com inventory_levels) |
| `inventory_levels` | array | Não | Estoque por location |
| `inventory_levels[].location_id` | string | Não | ID do depósito |
| `inventory_levels[].stock` | integer | Não | Quantidade nesse depósito |
| `categories` | array | Não | Array de IDs de categorias |
| `images` | array | Não | Array de imagens |

#### 6.2.2 Listar Produtos

```
GET /v1/{{store_id}}/products
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `page` | integer | Número da página |
| `per_page` | integer | Elementos por página |
| `created_at_min` | string | Data mínima ISO 8601 |
| `created_at_max` | string | Data máxima ISO 8601 |
| `status` | string | Estado do produto |

#### 6.2.3 Atualizar Produto

```
PUT /v1/{{store_id}}/products/{id}
```

Todos os campos opcionais.

#### 6.2.4 Adicionar Imagem ao Produto

```
POST /v1/{{store_id}}/products/{id}/images
```

```json
{ "src": "https://example.com/image2.jpg" }
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `src` | string | Sim | URL da imagem |

#### 6.2.5 Deletar Produto

```
DELETE /v1/{{store_id}}/products/{id}
```

| Código | Descrição |
|--------|-----------|
| 204 | No Content — Deletado com sucesso |
| 404 | Produto não encontrado |

### 6.3 Variações de Produto

#### 6.3.1 Criar Variação

```
POST /v1/{{store_id}}/products/{product_id}/variants
```

```bash
curl -X POST "https://api.nuvemshop.com/v1/{{store_id}}/products/{{product_id}}/variants" \
  -H "Content-Type: application/json" \
  -H "Authentication: Bearer {{app_token}}" \
  -H "User-Agent: Your App Name ({{app_id}})" \
  -d '{
    "price": 120.50,
    "stock": 20,
    "sku": "SKU-123",
    "attributes": [
      { "name": "Tamanho", "value": "M" },
      { "name": "Cor", "value": "Azul" }
    ]
  }'
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `price` | decimal | Não | Preço da variante |
| `stock` | integer | Não | Estoque da variante |
| `sku` | string | Sim | Código SKU único |
| `attributes` | array | Não | Array de atributos |
| `attributes[].name` | string | Não | Nome do atributo |
| `attributes[].value` | string | Não | Valor do atributo |
| `promotional_price` | decimal | Não | Preço promocional |
| `cost` | decimal | Não | Custo do produto |
| `weight` | decimal | Não | Peso em kg |
| `height` | decimal | Não | Altura em cm |
| `width` | decimal | Não | Largura em cm |
| `depth` | decimal | Não | Profundidade em cm |
| `image_id` | integer | Não | ID da imagem associada |
| `mpn` | string | Não | Manufacturer Part Number |
| `age_group` | string | Não | Grupo de idade (adult, kid, etc) |
| `gender` | string | Não | Gênero (male, female, unisex) |

#### 6.3.2 Atualizar Variação

```
PUT /v1/{{store_id}}/products/{product_id}/variants/{variant_id}
```

#### 6.3.3 Listar Variações

```
GET /v1/{{store_id}}/products/{product_id}/variants
```

#### 6.3.4 Obter Variação Específica

```
GET /v1/{{store_id}}/products/{product_id}/variants/{variant_id}
```

#### 6.3.5 Deletar Variação

```
DELETE /v1/{{store_id}}/products/{product_id}/variants/{variant_id}
```

### 6.4 Campos Personalizados em Variantes

#### 6.4.1 Listar Campos

```
GET /v1/{{store_id}}/products/variants/custom-fields
```

Response:
```json
[
  {
    "id": "custom_field_1",
    "name": "Material",
    "description": "Material de fabricação",
    "value_type": "text",
    "read_only": false,
    "values": []
  },
  {
    "id": "custom_field_2",
    "name": "Production status",
    "description": "Possible product production status",
    "value_type": "text_list",
    "read_only": false,
    "values": ["Started", "In Production", "Finished"]
  }
]
```

#### 6.4.2 Criar Campo

```
POST /v1/{{store_id}}/products/variants/custom-fields
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | Sim | Nome do campo |
| `description` | string | Não | Descrição |
| `value_type` | string | Sim | Tipo: "text", "text_list", "numeric" |
| `read_only` | boolean | Não | Somente leitura? (default: false) |
| `values` | array | Não | Array de valores possíveis |

#### 6.4.3 Atualizar Campo

```
PUT /v1/{{store_id}}/products/variants/custom-fields/{custom_field_id}
```

#### 6.4.4 Deletar Campo

```
DELETE /v1/{{store_id}}/products/variants/custom-fields/{custom_field_id}
```

---

## 7. Gestão de Pedidos (Orders)

> **IMPORTANTE**: A gestão de pedidos deve ser feita principalmente via webhooks. Webhooks notificam sua aplicação em tempo real sobre eventos como criação, atualização ou cancelamento de pedidos.

### Identificadores de Pedido:

| Identificador | Uso | Formato |
|---------------|-----|---------|
| **NUMBER** | Exibido ao cliente (amigável) | Formato legível |
| **ID** | Integrações (oficial) | 10 dígitos internos |

> **Recomendação**: Usar **ID interno do pedido** para integrações por maior precisão.

### 7.1 Webhooks de Pedidos

#### 7.1.1 Criar Webhook

```
POST /v1/{{store_id}}/webhooks
```

```bash
curl -X POST https://api.nuvemshop.com/v1/{{store_id}}/webhooks \
  -H 'Authentication: bearer {{app_token}}' \
  -H 'User-Agent: Your App Name ({{app_id}})' \
  -H 'Content-Type: application/json' \
  -d '{
    "event": "order/created",
    "url": "https://crm.papelariabibelo.com.br/api/webhooks/nuvemshop",
    "headers": {
      "Custom-Header": "Valor"
    }
  }'
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `event` | string | Sim | Evento a monitorar |
| `url` | string | Sim | URL para receber notificações |
| `headers` | object | Não | Headers personalizados |

#### Eventos Disponíveis:

- `order/created` — Novo pedido criado
- `order/updated` — Pedido atualizado
- `order/cancelled` — Pedido cancelado
- `order/status_changed` — Mudança de estado

#### 7.1.2 Listar Webhooks

```
GET /v1/{{store_id}}/webhooks
```

#### 7.1.3 Atualizar Webhook

```
PUT /v1/{{store_id}}/webhooks/{webhook_id}
```

#### 7.1.4 Deletar Webhook

```
DELETE /v1/{{store_id}}/webhooks/{webhook_id}
```

#### 7.1.5 Processar Notificações (Payload Recebido)

Quando ocorre um evento configurado, sua aplicação recebe POST:

```json
{
  "store_id": 5665778,
  "event": "order/created",
  "id": 1639882221
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `store_id` | integer | ID da loja que gerou o evento |
| `event` | string | Tipo de evento ocorrido |
| `id` | integer | ID do pedido |

**Implementação:**
1. Receber POST com payload
2. Validar que payload é da NuvemShop (HMAC)
3. Processar evento (criar/atualizar no CRM)
4. Responder com HTTP 200 OK

### 7.2 Endpoints REST de Pedidos

#### 7.2.1 Listar Pedidos

```
GET /v1/{{store_id}}/orders
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `page` | integer | Número da página |
| `per_page` | integer | Elementos por página |
| `status` | string | Filtrar por estado |
| `created_at_min` | string | Data mínima (ISO 8601) |
| `created_at_max` | string | Data máxima (ISO 8601) |

**Estados válidos**: `open`, `paid`, `closed`, `cancelled`

#### 7.2.2 Obter Detalhes do Pedido

```
GET /v1/{{store_id}}/orders/{order_id}
```

Response:
```json
{
  "id": 1639882221,
  "number": "ORD-001",
  "status": "open",
  "created_at": "2023-01-15T10:30:00Z",
  "updated_at": "2023-01-15T11:00:00Z",
  "customer": {
    "id": 123456,
    "name": "John Doe",
    "email": "john@example.com"
  },
  "items": [
    {
      "id": 1,
      "sku": "SKU-123",
      "name": "Camiseta Azul",
      "quantity": 2,
      "price": 49.99
    }
  ],
  "payment": {
    "status": "pending",
    "method": "credit_card"
  },
  "shipping": {
    "status": "pending",
    "method": "standard",
    "cost": 10.00
  }
}
```

#### 7.2.3 Atualizar Pedido

```
PUT /v1/{{store_id}}/orders/{order_id}
```

| Campo | Tipo | Valores Possíveis | Descrição |
|-------|------|-------------------|-----------|
| `status` | string | open, paid, closed, cancelled | Novo estado |
| `owner_note` | string | Qualquer texto | Nota do proprietário |

#### 7.2.4 Cancelar Pedido

```
POST /v1/{{store_id}}/orders/{order_id}/cancel
```

ou

```
DELETE /v1/{{store_id}}/orders/{order_id}
```

### 7.3 Fulfillment Orders (Ordens de Cumprimento)

> Fulfillment Order permite gestionar envios de pedidos quando há múltiplas origens (locations). Separa um pedido em diferentes "ordens de cumprimento", cada uma representando um envio específico.

#### 7.3.1 Listar Fulfillment Orders

```
GET /v1/{{store_id}}/orders/{order_id}/fulfillment-orders
```

Response:
```json
[
  {
    "id": "01FHZXHK8PTP9FVK99Z66GXASS",
    "order_id": 1639882221,
    "status": "pending",
    "location_id": "01HTMFDH09VC6E2Q8KGTGP44D3",
    "items": [
      { "sku": "SKU-123", "quantity": 2 }
    ]
  }
]
```

#### 7.3.2 Obter Fulfillment Order Específica

```
GET /v1/{{store_id}}/orders/{order_id}/fulfillment-orders/{fulfillment_order_id}
```

#### 7.3.3 Criar Evento de Fulfillment (Rastreamento)

```
POST /v1/{{store_id}}/orders/{order_id}/fulfillment-orders/{fulfillment_order_id}/tracking-events
```

```json
{
  "status": "dispatched",
  "description": "The package was dispatched",
  "address": "Rua Exemplo 123, São Paulo - SP 02910802",
  "geolocation": {
    "longitude": 73.856077,
    "latitude": 40.848447
  },
  "happened_at": "2022-11-24T10:20:19+00:00",
  "estimated_delivery_at": "2022-11-24T10:20:19+00:00"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `status` | string | Sim | Estado: dispatched, in_transit, delivered, etc |
| `description` | string | Não | Descrição do evento |
| `address` | string | Não | Endereço relevante |
| `geolocation` | object | Não | Coordenadas GPS (longitude, latitude) |
| `happened_at` | string | Não | Quando ocorreu (ISO 8601) |
| `estimated_delivery_at` | string | Não | Entrega estimada (ISO 8601) |

#### 7.3.4 Atualizar Evento

```
PUT /v1/{{store_id}}/orders/{order_id}/fulfillment-orders/{fid}/tracking-events/{eid}
```

#### 7.3.5 Deletar Evento

```
DELETE /v1/{{store_id}}/orders/{order_id}/fulfillment-orders/{fid}/tracking-events/{eid}
```

---

## 8. Gestão de Faturamento (Invoices / NF-e)

### Criar Fatura (NF-e)

```
POST /v1/{{store_id}}/orders/{order_id}/metafields
```

```bash
curl -X POST https://api.nuvemshop.com/v1/{{store_id}}/metafields \
  -H 'Authentication: bearer {{app_token}}' \
  -H 'User-Agent: Your App Name ({{app_id}})' \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "nfe",
    "key": "list",
    "value": "[{\"key\": \"55555555555555555555555555555\", \"link\": \"http://nfe.com.br/nsaasb\", \"fulfillment_order_id\": \"01FHZXHK8PTP9FVK99Z66GXASS\"}]",
    "description": "Lista de NFes",
    "owner_resource": "Order",
    "owner_id": 12345678
  }'
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `namespace` | string | Sim | Namespace (ex: "nfe" para Nota Fiscal) |
| `key` | string | Sim | Identificador do metafield |
| `value` | string | Sim | JSON string com dados da fatura |
| `description` | string | Não | Descrição da fatura |
| `owner_resource` | string | Sim | Recurso proprietário (ex: "Order") |
| `owner_id` | integer | Sim | ID do pedido |

### Estrutura do Valor (JSON String):

```json
[
  {
    "key": "55555555555555555555555555555",
    "link": "http://nfe.com.br/nsaasb",
    "fulfillment_order_id": "01FHZXHK8PTP9FVK99Z66GXASS"
  }
]
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `key` | string | Chave de acesso da NF-e |
| `link` | string | URL para visualizar/download |
| `fulfillment_order_id` | string | ID da fulfillment order associada |

### Erros Comuns:

| Código | Causa | Solução |
|--------|-------|---------|
| 401 | Unauthorized | Verificar token no header |
| 404 | Not Found | Verificar que order_id existe |
| 422 | Unprocessable Entity | Validar formato dos dados (key, link) |

---

## 9. Gestão de Clientes

### 9.1 Listar Clientes

```
GET /v1/{{store_id}}/customers
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `page` | integer | Número da página |
| `per_page` | integer | Elementos por página |
| `created_at_min` | string | Data mínima |
| `created_at_max` | string | Data máxima |

Response:
```json
[
  {
    "id": 123456,
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+5511999999999",
    "document": "12345678901234",
    "created_at": "2023-01-15T10:30:00Z"
  }
]
```

### 9.2 Obter Cliente Específico

```
GET /v1/{{store_id}}/customers/{customer_id}
```

### 9.3 Criar Cliente

```
POST /v1/{{store_id}}/customers
```

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+5511999999999",
  "document": "12345678901234",
  "addresses": [
    {
      "street": "Rua Exemplo",
      "number": "123",
      "city": "São Paulo",
      "province": "SP",
      "country": "BR",
      "zipcode": "01234-567"
    }
  ]
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | Sim | Nome do cliente |
| `email` | string | Sim | Email do cliente |
| `phone` | string | Não | Telefone |
| `document` | string | Não | Documento (CPF/CNPJ) |
| `addresses` | array | Não | Array de endereços |
| `addresses[].street` | string | Não | Rua |
| `addresses[].number` | string | Não | Número |
| `addresses[].city` | string | Não | Cidade |
| `addresses[].province` | string | Não | Estado |
| `addresses[].country` | string | Não | País |
| `addresses[].zipcode` | string | Não | CEP |

### 9.4 Atualizar Cliente

```
PUT /v1/{{store_id}}/customers/{customer_id}
```

---

## 10. Tabela Consolidada de Endpoints

| Recurso | Método | Endpoint | Descrição |
|---------|--------|----------|-----------|
| **Depósitos** | POST | `/locations` | Criar depósito |
| | GET | `/locations` | Listar depósitos |
| | PUT | `/locations/{id}` | Atualizar depósito |
| | PATCH | `/locations/priorities` | Modificar prioridades |
| | PATCH | `/locations/{id}/chosen-as-default` | Marcar como padrão |
| **Categorias** | POST | `/categories` | Criar categoria |
| | PUT | `/categories/{id}` | Atualizar categoria |
| **Produtos** | POST | `/products` | Criar produto |
| | GET | `/products` | Listar produtos |
| | PUT | `/products/{id}` | Atualizar produto |
| | DELETE | `/products/{id}` | Deletar produto |
| | POST | `/products/{id}/images` | Adicionar imagem |
| **Variantes** | POST | `/products/{id}/variants` | Criar variante |
| | GET | `/products/{id}/variants` | Listar variantes |
| | GET | `/products/{id}/variants/{vid}` | Obter variante |
| | PUT | `/products/{id}/variants/{vid}` | Atualizar variante |
| | DELETE | `/products/{id}/variants/{vid}` | Deletar variante |
| **Campos Custom** | GET | `/products/variants/custom-fields` | Listar campos |
| | POST | `/products/variants/custom-fields` | Criar campo |
| | PUT | `/products/variants/custom-fields/{id}` | Atualizar campo |
| | DELETE | `/products/variants/custom-fields/{id}` | Deletar campo |
| **Webhooks** | POST | `/webhooks` | Criar webhook |
| | GET | `/webhooks` | Listar webhooks |
| | PUT | `/webhooks/{id}` | Atualizar webhook |
| | DELETE | `/webhooks/{id}` | Deletar webhook |
| **Pedidos** | GET | `/orders` | Listar pedidos |
| | GET | `/orders/{id}` | Obter pedido |
| | PUT | `/orders/{id}` | Atualizar pedido |
| | POST | `/orders/{id}/cancel` | Cancelar pedido |
| | DELETE | `/orders/{id}` | Deletar pedido |
| **Fulfillment** | GET | `/orders/{id}/fulfillment-orders` | Listar fulfillments |
| | POST | `/orders/{id}/fulfillment-orders/{fid}/tracking-events` | Criar evento |
| | PUT | `...tracking-events/{eid}` | Atualizar evento |
| | DELETE | `...tracking-events/{eid}` | Deletar evento |
| **Faturas** | POST | `/metafields` | Criar fatura (NF-e) |
| **Clientes** | GET | `/customers` | Listar clientes |
| | GET | `/customers/{id}` | Obter cliente |
| | POST | `/customers` | Criar cliente |
| | PUT | `/customers/{id}` | Atualizar cliente |

> **Base URL**: `https://api.nuvemshop.com/v1/{{store_id}}/`

---

## 11. Boas Práticas

### Autenticação
- Usar sempre Bearer token no header `Authentication`
- Tokens não expiram automaticamente
- Renovar credenciais se comprometidas

### Rate Limiting
- Monitorar headers `x-rate-limit-*`
- Implementar retry exponencial em 429
- Esperar `x-rate-limit-reset` antes de retentar

### Paginação
- Usar `page` e `per_page` para navegação
- Revisar `x-total-count` para quantidade total
- Processar `Link` headers para navegação automática

### Integração ERP/CRM
- Usar webhooks para eventos de pedidos
- Sincronizar estoque regularmente
- Manter mapeamentos SKU <-> ID produto
- Implementar validações de integridade

### Headers Obrigatórios em Todas as Requisições

```
Authentication: bearer {{app_token}}
User-Agent: Your App Name ({{app_id}})
Content-Type: application/json
```

---

## 12. Criação do App

- Portal de parceiros: partners.nuvemshop.com.br
- Postman Collection disponível na documentação
- Checklist de homologação obrigatório para publicar na App Store

---

*Documento salvo em 2026-03-28 para uso como referência no BibelôCRM*
