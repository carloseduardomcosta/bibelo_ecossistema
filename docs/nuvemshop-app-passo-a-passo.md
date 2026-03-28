# NuvemShop App — Passo a Passo Completo

> Guia para criar e integrar o app NuvemShop com o BibelôCRM
> Criado em: 2026-03-28
> Status: Aguardando credenciais (Fase 0)

---

## Visão Geral

O app NuvemShop conecta a loja online papelariabibelo.com.br ao BibelôCRM, permitindo:
- Sync de clientes, pedidos e produtos da loja online
- Detecção e recuperação de carrinho abandonado
- Perfil unificado do cliente (loja física + online)
- Rastreamento de envios e NF-e no pedido online

---

## FASE 0 — Cadastro e Criação do App (Carlos, no navegador)

### Passo 1 — Criar conta de parceiro

- Acesse **https://partners.nuvemshop.com.br**
- Cadastre-se como **"Parceiro Tecnológico"**
- Dados: nome (Carlos Eduardo), email, empresa (Papelaria Bibelô)

### Passo 2 — Criar o aplicativo

- No painel de parceiros, clique **"Criar Aplicação"**
- Nome: `BibelôCRM`
- Tipo: **Aplicação Externa (Standalone)** — nosso CRM roda fora do admin da NuvemShop, não precisa de iframe
- Disponibilidade: **"Para Seus Clientes"** — uso privado, sem necessidade de homologação na App Store (é só pra sua loja)

### Passo 3 — Configurar dados básicos

**URL de redirecionamento (callback):**
```
https://crm.papelariabibelo.com.br/api/auth/nuvemshop/callback
```

**Permissões (scopes) — ativar todas estas:**

| Scope | Para quê |
|-------|----------|
| `products` | Sync de produtos e estoque |
| `orders` | Pedidos + carrinho abandonado |
| `customers` | Clientes da loja online |
| `webhooks` | Registrar webhooks via API |
| `metafields` | Vincular NF-e aos pedidos |

### Passo 4 — Anotar credenciais

Copiar e guardar com segurança:
- **`app_id`** (client_id) — ex: `12345`
- **`client_secret`** — ex: `abcdef123456`

> Essas credenciais vão para o arquivo `.env` no servidor. Enviar para Carlos Eduardo de forma segura (nunca por chat aberto).

### Passo 5 — Criar loja de demonstração (para testes)

- No painel de parceiros: **https://partners.nuvemshop.com.br/stores/create?type=demo**
- Essa loja demo serve para testar toda a integração antes de apontar para a loja real
- Anotar o ID da loja demo

---

## FASE 1 — OAuth2 no BibelôCRM (desenvolvimento)

### Passo 6 — Adicionar variáveis de ambiente

Adicionar ao `.env` do servidor:
```env
NUVEMSHOP_APP_ID=seu_app_id_aqui
NUVEMSHOP_CLIENT_SECRET=seu_client_secret_aqui
NUVEMSHOP_REDIRECT_URI=https://crm.papelariabibelo.com.br/api/auth/nuvemshop/callback
```

### Passo 7 — Criar rota de autorização

- **`GET /api/auth/nuvemshop`** — gera a URL e redireciona o navegador para a NuvemShop pedir permissão
- URL de autorização: `https://www.tiendanube.com/apps/{app_id}/authorize`
- O lojista vê a tela de permissões e autoriza

### Passo 8 — Criar rota de callback

- **`GET /api/auth/nuvemshop/callback`** — recebe o `code` da NuvemShop após autorização
- Troca o `code` por `access_token` via:
  ```
  POST https://www.nuvemshop.com/apps/authorize/token
  Body: { client_id, client_secret, grant_type: "authorization_code", code }
  ```
- Recebe: `access_token` + `user_id` (store_id)
- Salva token + store_id em `sync.sync_state` (fonte: 'nuvemshop')
- **Token NUNCA expira** — sem refresh necessário (diferente do Bling!)
- Redireciona para o frontend: `/sync` com mensagem de sucesso

---

## FASE 2 — Instalar App e Registrar Webhooks

### Passo 9 — Instalar o app na loja demo (Carlos, no navegador)

- Acessar: `https://www.tiendanube.com/apps/{app_id}/authorize`
- Estar logado na loja demo
- Autorizar as permissões
- O callback recebe o token — integração conectada!

### Passo 10 — Registrar webhooks automaticamente (desenvolvimento)

Após salvar o token, o sistema registra webhooks via API:

```
POST https://api.nuvemshop.com/v1/{store_id}/webhooks
Headers: Authentication: bearer {token}
```

| Evento | URL de destino | Para quê |
|--------|---------------|----------|
| `order/created` | `https://crm.papelariabibelo.com.br/api/webhooks/nuvemshop` | Pedido novo |
| `order/updated` | `https://crm.papelariabibelo.com.br/api/webhooks/nuvemshop` | Mudança de status |
| `order/cancelled` | `https://crm.papelariabibelo.com.br/api/webhooks/nuvemshop` | Cancelamento |
| `order/paid` | `https://crm.papelariabibelo.com.br/api/webhooks/nuvemshop` | Pagamento confirmado |

- IDs dos webhooks criados ficam salvos no banco para poder atualizar/deletar depois

### Passo 11 — Atualizar handler de webhooks existente (desenvolvimento)

Já temos `api/src/integrations/nuvemshop/webhook.ts` com:
- ✅ `order/created` — processando
- ✅ `order/paid` — processando
- ✅ `customer/created` — processando

Adicionar:
- ⬜ `order/updated` — atualizar status no banco
- ⬜ `order/cancelled` — marcar cancelado, recalcular score

---

## FASE 3 — Sync de Dados (desenvolvimento)

### Passo 12 — Sync inicial de clientes

- `GET /v1/{store_id}/customers?per_page=200&page=1...N`
- Percorrer todas as páginas (header `x-total-count` diz o total)
- Upsert em `crm.customers` com `canal_origem: 'nuvemshop'`
- Campos: nome, email, telefone, documento (CPF), endereço
- Respeitar rate limit: **2 req/s**, monitorar headers `x-rate-limit-*`

### Passo 13 — Sync inicial de pedidos

- `GET /v1/{store_id}/orders?per_page=200&page=1...N`
- Salvar em `sync.nuvemshop_orders`
- Detalhe de cada pedido: `GET /v1/{store_id}/orders/{id}` (itens, pagamento, frete)
- Vincular ao cliente via email/nuvemshop_id
- Atualizar score dos clientes após sync

### Passo 14 — Sync de produtos

- `GET /v1/{store_id}/products?per_page=200` — trazer catálogo online
- Cruzar com produtos do Bling por **SKU** (`codigo` no Bling = `sku` na NuvemShop)
- Mapear IDs: produto Bling ↔ produto NuvemShop
- Base para sync de estoque bidirecional no futuro

### Passo 15 — Agendar sync periódico no BullMQ

- Job `nuvemshop-sync` a cada **30 minutos** (mesmo padrão do Bling)
- Sync incremental: filtro `created_at_min` = data da última sync
- Webhooks cuidam do tempo real, o job cuida de **consistência** (caso algum webhook falhe)

---

## FASE 4 — Carrinho Abandonado (desenvolvimento)

### Passo 16 — Detectar carrinhos abandonados

Job BullMQ a cada **1 hora**:
- `GET /v1/{store_id}/orders?status=open&created_at_max={2_horas_atras}`
- Pedidos com status `open` que nunca viraram `paid` = **carrinho abandonado**
- Salvar na tabela de fluxos/campanhas para disparo

### Passo 17 — Criar fluxo de recuperação

- Identificar o cliente do pedido abandonado
- Listar os produtos que ele deixou no carrinho
- Disparar **email via Resend** (já temos integração ativa!) com:
  - Nome do cliente
  - Fotos e nomes dos produtos abandonados
  - Link direto para o checkout da NuvemShop
  - Cupom de desconto opcional
- Opcionalmente: **WhatsApp via Evolution** (quando ativarmos)
- Marcar como "notificado" para não enviar duplicado

**Timing recomendado:**
- 1º email: 2h após abandono
- 2º email: 24h após abandono (se não converteu)
- WhatsApp: 48h após abandono (último recurso)

---

## FASE 5 — Frontend no CRM (desenvolvimento)

### Passo 18 — Painel NuvemShop na página Sync

- Botão **"Conectar NuvemShop"** que redireciona para OAuth
- Status da conexão: 🟢 Conectado / 🔴 Desconectado
- Nome da loja + store_id
- Botão de **sync manual** (clientes + pedidos)
- Lista de **webhooks registrados**
- **Logs** de sincronização (sucesso/erro/quantidade)

### Passo 19 — Indicadores no Dashboard

- Pedidos online (NuvemShop) vs Pedidos loja física (Bling)
- Carrinhos abandonados: detectados / emails enviados / recuperados
- Clientes unificados (presentes nas duas fontes)
- Receita online vs receita presencial

---

## FASE 6 — Apontar para Loja Real (Carlos, no navegador)

### Passo 20 — Testar tudo na loja demo

Validar que tudo funciona:
- [ ] OAuth conecta e salva token
- [ ] Webhooks chegam e processam corretamente
- [ ] Sync de clientes traz todos com dados corretos
- [ ] Sync de pedidos com itens e valores
- [ ] Carrinho abandonado detecta pedidos `open`
- [ ] Email de recuperação é enviado
- [ ] Painel Sync mostra status correto

### Passo 21 — Instalar na loja real (Carlos, no navegador)

- Acessar: `https://www.tiendanube.com/apps/{app_id}/authorize`
- Estar logado na conta da **papelariabibelo.com.br**
- Autorizar as permissões
- Token salvo — **produção ativa!**

### Passo 22 — Webhooks em produção

- Automático: mesmo fluxo do passo 10, agora registrando webhooks na loja real
- A partir daqui, todo pedido novo na NuvemShop chega automaticamente no CRM

---

## Resumo: Quem faz o quê

```
CARLOS (navegador)                  DESENVOLVIMENTO (código)
──────────────────                  ────────────────────────
1. Criar conta parceiro
2. Criar app standalone
3. Configurar scopes + URL
4. Anotar credenciais
5. Criar loja demo
                                    6.  Variáveis .env
                                    7.  Rota OAuth authorize
                                    8.  Rota OAuth callback
9. Instalar app na demo
                                    10. Registrar webhooks
                                    11. Atualizar handler
                                    12. Sync clientes
                                    13. Sync pedidos
                                    14. Sync produtos
                                    15. Job BullMQ periódico
                                    16. Detectar carrinho abandonado
                                    17. Fluxo de recuperação
                                    18. Frontend painel Sync
                                    19. Dashboard indicadores
20. Testar na demo
21. Instalar na loja real
22. Produção ativa!
```

**Seus passos**: 1 a 5 e 9, 20, 21 — tudo no navegador, ~30 minutos
**Desenvolvimento**: passos 6 a 19 — feito no código pelo agente

---

## Referências

- Documentação API completa: `docs/nuvemshop-api-erp-guide.md`
- Portal de parceiros: https://partners.nuvemshop.com.br
- Loja demo: https://partners.nuvemshop.com.br/stores/create?type=demo
- Endpoint token: https://www.nuvemshop.com/apps/authorize/token
- API base: https://api.nuvemshop.com/v1/{store_id}/

---

## Detalhes Técnicos Importantes

### Token nunca expira
Diferente do Bling (refresh a cada 6h), o token da NuvemShop é **permanente**. Só é revogado se o app for desinstalado.

### Rate limit
- **2 req/s** com bucket de 40
- Headers para monitorar: `x-rate-limit-remaining`, `x-rate-limit-reset`
- Em caso de 429: esperar `x-rate-limit-reset` ms
- Planos Next/Evolution: limites multiplicados por 10

### Paginação
- Máximo **200 itens por página** (padrão: 25)
- Header `x-total-count` informa o total
- Header `Link` tem URLs de próxima/anterior página

### Identificador de pedido
- Usar **ID interno** (10 dígitos) nas integrações, não o NUMBER amigável

### Headers obrigatórios em toda requisição
```
Authentication: bearer {token}
User-Agent: BibeloCRM ({app_id})
Content-Type: application/json
```

---

*BibelôCRM — Integração NuvemShop*
*Criado em: 2026-03-28*
