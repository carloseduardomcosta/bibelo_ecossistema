# Bling ERP API v3 — Referência

Documentação extraída em 27/03/2026.
OpenAPI spec completo: `docs/bling-api-openapi.json`

---

## URLs

| | URL |
|---|---|
| **API Base** | `https://api.bling.com.br/Api/v3` |
| **OAuth Authorize** | `https://bling.com.br/Api/v3/oauth/authorize` |
| **OAuth Token** | `https://bling.com.br/Api/v3/oauth/token` |
| **OpenAPI JSON** | `https://developer.bling.com.br/build/assets/openapi-Bzsl2ExF.json` |

---

## Rate Limits

| Limite | Valor |
|---|---|
| Requests/segundo | **3** |
| Requests/dia | **120.000** |
| 300 erros em 10s | bloqueio IP 10min |
| 600 requests em 10s | bloqueio IP 10min |
| 20 `/oauth/token` em 60s | bloqueio 60min |
| Filtro de data máximo | 1 ano |

---

## Autenticação OAuth 2.0

1. Redireciona para `/oauth/authorize?response_type=code&client_id={id}&redirect_uri={uri}&state={state}`
2. Bling retorna `code` para o redirect_uri
3. Troca `code` por tokens via POST `/oauth/token` com Basic auth `base64(client_id:client_secret)`
4. Access token válido por ~6h, refresh token por 30 dias
5. Renovar via `grant_type=refresh_token`

---

## Endpoints Principais

### Contatos (scope: `contact`)

| Método | Path | Descrição |
|---|---|---|
| GET | `/contatos` | Lista paginada (filtros: pesquisa, dataAlteração, uf, telefone, tipoPessoa) |
| POST | `/contatos` | Criar contato |
| GET | `/contatos/{id}` | Detalhe |
| PUT | `/contatos/{id}` | Atualizar |
| DELETE | `/contatos/{id}` | Deletar |

**Campos:** nome, codigo, situacao (A/E/I/S), numeroDocumento, telefone, celular, email, tipo (J/F/E), endereco, vendedor, dadosAdicionais (dataNascimento, sexo)

### Produtos (scope: `product`)

| Método | Path | Descrição |
|---|---|---|
| GET | `/produtos` | Lista paginada (filtros: nome, tipo, dataAlteração, idCategoria, codigos[], gtins[]) |
| POST | `/produtos` | Criar produto |
| GET | `/produtos/{id}` | Detalhe completo |
| PUT | `/produtos/{id}` | Atualizar |
| DELETE | `/produtos/{id}` | Deletar |

**Campos:** nome, codigo (SKU), preco, precoCusto (read-only), tipo (S/P/N), situacao (A/I), formato (S/V/E), unidade, gtin, pesoBruto, pesoLiquido, categoria, estoque, fornecedor, dimensoes, tributacao, midia, variacoes

**Sub-recursos:** estruturas (composição), fornecedores, lojas, lotes

### Estoques (scope: `stock`)

| Método | Path | Descrição |
|---|---|---|
| POST | `/estoques` | Criar movimentação (entrada/saída/balanço) |
| GET | `/estoques/saldos` | Saldos por produto (**requer `idsProdutos[]`**) |
| GET | `/estoques/saldos/{idDeposito}` | Saldos por depósito |

**POST /estoques body:** produto.id, deposito.id, operacao (B/E/S), quantidade, preco, custo, observacoes

**GET /estoques/saldos resposta:** produto.id, produto.codigo, saldoFisicoTotal, saldoVirtualTotal, depositos[{id, saldoFisico, saldoVirtual}]

### Pedidos de Vendas (scope: `order`)

| Método | Path | Descrição |
|---|---|---|
| GET | `/pedidos/vendas` | Lista paginada (filtros: idContato, idsSituacoes[], dataInicial/Final, numero, idLoja) |
| POST | `/pedidos/vendas` | Criar pedido |
| GET | `/pedidos/vendas/{id}` | Detalhe |
| PUT | `/pedidos/vendas/{id}` | Atualizar |
| DELETE | `/pedidos/vendas/{id}` | Deletar |
| POST | `/pedidos/vendas/{id}/lancar-estoque` | Lançar estoque |
| POST | `/pedidos/vendas/{id}/gerar-nfe` | Gerar NF-e |

**Campos:** numero, data, contato.id, situacao, loja, itens[] (codigo, unidade, quantidade, valor, desconto), parcelas[] (dataVencimento, valor, formaPagamento), transporte, vendedor

### Pedidos de Compras

| Método | Path | Descrição |
|---|---|---|
| GET | `/pedidos/compras` | Lista |
| POST | `/pedidos/compras` | Criar |
| GET/PUT/DELETE | `/pedidos/compras/{id}` | CRUD |

### Depósitos

| Método | Path | Descrição |
|---|---|---|
| GET | `/depositos` | Lista depósitos |
| POST | `/depositos` | Criar depósito |
| GET | `/depositos/{id}` | Detalhe |
| PUT | `/depositos/{id}` | Atualizar |

### NF-e (scope: `invoice`)

| Método | Path | Descrição |
|---|---|---|
| GET | `/nfe` | Lista |
| POST | `/nfe` | Criar |
| POST | `/nfe/{id}/enviar` | Enviar para SEFAZ |
| GET | `/nfe/{id}` | Detalhe |

### Contas a Receber/Pagar

| Método | Path | Descrição |
|---|---|---|
| GET | `/contas/receber` | Lista |
| POST | `/contas/receber` | Criar |
| GET | `/contas/pagar` | Lista |
| POST | `/contas/pagar` | Criar |

---

## Webhooks

Configurados no painel do app no developer.bling.com.br.

### Eventos disponíveis

| Recurso | Scope | Eventos |
|---|---|---|
| Pedidos de Venda | `order` | created, updated, deleted |
| Produtos | `product` | created, updated, deleted |
| Estoque | `stock` | created, updated, deleted |
| Estoque Virtual | `virtual_stock` | (automático com stock) |
| NF-e | `invoice` | created, updated, deleted |
| NFC-e | `consumer_invoice` | created, updated, deleted |

### Payload

```json
{
  "eventId": "unique_id",
  "date": "ISO_8601",
  "version": "webhook_version",
  "event": "resource.action",
  "companyId": 123456,
  "data": { ... }
}
```

### Validação

- Header: `X-Bling-Signature-256: sha256=<hex_hash>`
- Chave: `client_secret` do app
- Payload: body JSON raw UTF-8
- Timeout: 5 segundos
- Retry: até 3 dias com intervalos progressivos

---

## Formato de Erros

```json
{
  "error": {
    "type": "VALIDATION_ERROR",
    "message": "Mensagem",
    "description": "Descrição detalhada",
    "fields": [{ "fieldName": "...", "message": "..." }]
  }
}
```

**Tipos:** BAD_REQUEST, VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RESOURCE_NOT_FOUND, TOO_MANY_REQUESTS, SERVER_ERROR

---

## Paginação

Todos os endpoints de lista usam:
- `pagina` (default: 1)
- `limite` (default/max: 100)

---

*Fonte: OpenAPI spec oficial do Bling*
*URL: https://developer.bling.com.br/build/assets/openapi-Bzsl2ExF.json*
