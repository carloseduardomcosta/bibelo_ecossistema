# Programa Sou Parceira — Documentação Completa

Módulo B2B da Papelaria Bibelô para gestão de revendedoras parceiras.
Portal próprio, tiers de desconto progressivo, catálogo com preço calculado server-side.

---

## Visão geral

O **Sou Parceira** é o programa de revendedoras da Bibelô. Uma parceira compra o catálogo da JC Atacado com desconto progressivo baseado no volume mensal, revende nos seus canais, e sobe de nível conforme cresce.

```
Carlos (admin CRM)          Revendedora (Portal Sou Parceira)
        │                               │
        │  cadastra via CRM             │  acessa via CPF (OTP)
        ▼                               ▼
 crm.revendedoras ──────────── souparceira.papelariabibelo.com.br
        │                               │
        │  aprova pedido / muda status  │  faz pedido / envia mensagem
        ▼                               ▼
  email → revendedora             email → contato@papelariabibelo.com.br
  notificação sininho CRM         notificação sininho CRM
```

---

## Estrutura de tiers

| Nível | Volume mensal | Desconto | Frete | Ícone |
|-------|--------------|----------|-------|-------|
| **Iniciante** | < R$ 150/mês | 15% | Por conta da revendedora | ✨ |
| **Bronze** | R$ 150 – 599/mês | 25% | Por conta da revendedora | 🥉 |
| **Prata** | R$ 600 – 1.199/mês | 35% | Por conta da revendedora | 🥈 |
| **Ouro** | R$ 1.200 – 2.999/mês | 45% | **Frete grátis** (Bibelô arca) | 🥇 |
| **Diamante** | R$ 3.000+/mês | 45% | **Frete grátis** + benefícios exclusivos | 💎 |

O nível é calculado automaticamente a cada pedido aprovado pelo admin, baseado no `volume_mes_atual` da revendedora.

**Função de cálculo:** `calcularNivel(volume)` em `api/src/routes/revendedoras.ts`

---

## Autenticação do portal (passwordless OTP via CPF)

O portal não usa senha. A revendedora autentica com CPF + código de 6 dígitos enviado por email.

```
1. POST /api/souparceira/login  { cpf: "000.000.000-00" }
   └── gera OTP de 6 dígitos (crypto.randomInt)
   └── salva hash bcrypt em crm.revendedoras.otp_hash + otp_expira_em (10min)
   └── envia email com o código

2. POST /api/souparceira/login  { cpf: "...", otp: "123456" }
   └── verifica bcrypt
   └── retorna JWT com { revendedoraId, iss: "souparceira" } (7 dias)

3. Todas as rotas /api/souparceira/* validam JWT com iss === "souparceira"
```

**Segurança:** CPF não exposto no JWT. OTP expira em 10 minutos. Tentativas erradas não revelam se o CPF existe.

---

## Portal — funcionalidades da revendedora

Arquivo: `frontend/src/pages/PortalRevendedora.tsx` (portal público, sem auth CRM)
URL: `souparceira.papelariabibelo.com.br` (via Nginx → porta 4000)

| Feature | Descrição |
|---------|-----------|
| **Dashboard** | Volume do mês, próximo tier, pedidos recentes |
| **Catálogo** | Produtos aprovados do JC Atacado com preço calculado |
| **Fazer pedido** | Seleciona itens → envia pedido para aprovação do admin |
| **Meus pedidos** | Lista pedidos com status + badge de mensagens não lidas |
| **Thread de mensagens** | Chat por pedido (revendedora ↔ admin) |
| **Perfil** | Dados pessoais, endereço, conquistas, progresso de nível |

---

## CRM — funcionalidades do admin

Arquivo: `frontend/src/pages/Revendedoras.tsx` (lista + stats)
Arquivo: `frontend/src/pages/RevendedoraPerfil.tsx` (perfil individual)

### Página Revendedoras (`/revendedoras`)
- **Stats:** total, ativas, volume/mês, pedidos pendentes, distribuição por nível
- **Lista:** busca por nome/email/telefone, filtros de status e nível
- **Aprovar** revendedoras pendentes direto na lista
- **Botão "Editar emails"** → modal com editor HTML dos 3 templates de email

### Perfil individual (`/revendedoras/:id`)
- KPIs: total vendido, volume atual, meses consecutivos, total pedidos
- **Barra de progresso** para próximo nível com meta e valor faltante
- **Gerenciar pedidos:** aprovar, mudar status, adicionar observação (vira mensagem no thread)
- **Thread de mensagens** por pedido
- **Estoque pessoal:** controle de produtos enviados à revendedora
- **Conquistas:** desbloqueio manual ou automático (badges gamificados)
- **Token do portal:** gerar link único de 90 dias para a revendedora acessar

---

## Sistema de emails

### 3 templates automáticos

| Template | Slug | Quando dispara |
|----------|------|---------------|
| Boas-vindas | `revendedoras_boas_vindas` | Ao cadastrar nova revendedora |
| Status do pedido | `revendedoras_status_pedido` | Ao mudar status de um pedido |
| Nova mensagem | `revendedoras_nova_mensagem` | Admin envia mensagem no thread |

**Remetente:** `Sou Parceira Bibelô <souparceira@papelariabibelo.com.br>`

### Variáveis disponíveis por template

**Boas-vindas:**
- `{{nome}}` — nome da revendedora
- `{{cpf_formatado}}` — CPF no formato 000.000.000-00
- `{{desconto}}` — percentual de desconto inicial (ex: `15`)
- `{{nivel_label}}` — nível em texto (ex: `Iniciante`)
- `{{tabela_niveis}}` — tabela HTML comparativa de níveis (gerada automaticamente)

**Status do pedido:**
- `{{nome}}` — nome da revendedora
- `{{numero_pedido}}` — número do pedido (ex: `PED-2026-001`)
- `{{status_label}}` — status com emoji (ex: `✅ Aprovado`)
- `{{observacao_block}}` — bloco HTML com mensagem do admin (vazio se não houver)

**Nova mensagem:**
- `{{destinatario}}` — quem recebe (revendedora ou admin)
- `{{remetente}}` — quem enviou
- `{{numero_pedido}}` — número do pedido
- `{{conteudo}}` — texto da mensagem

### Edição via frontend

Os templates são armazenados na tabela `marketing.templates` com `categoria = 'revendedoras'`.
Na página CRM → Revendedoras → botão **"✉ Editar emails"** abre modal com:
- Sidebar: seleciona qual dos 3 templates editar
- Editor HTML com chips de variáveis disponíveis (hover = descrição)
- Pré-visualização via iframe
- Salvar persiste no banco; próximos envios usam o template salvo

**Fallback:** se o template do banco for removido, o sistema usa o HTML hardcoded em `buildBoasVindasParceira()` / `buildStatusEmail()` / `buildMensagemEmail()`.

---

## Fluxo de pedido

```
Revendedora → POST /api/souparceira/pedidos
  └── preço recalculado server-side (ignora preco_unitario do body)
  └── status inicial: "pendente"
  └── email para contato@papelariabibelo.com.br (notificação admin)
  └── notificação no sininho CRM

Carlos (admin) → PUT /api/revendedoras/:id/pedidos/:pedidoId/status
  └── status: pendente → aprovado → enviado → entregue | cancelado
  └── email automático para revendedora com novo status
  └── se observacao_admin → cria mensagem no thread + envia email
  └── ao aprovar: volume_mes_atual atualizado → nível recalculado
```

---

## Banco de dados

Schema: `crm`

### Tabela principal: `crm.revendedoras`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `nome` | varchar(200) | |
| `email` | varchar(200) UNIQUE | |
| `telefone` | varchar(20) | |
| `documento` | varchar(20) | CPF ou CNPJ |
| `cidade`, `estado` | varchar | |
| `cep`, `logradouro`, `numero`, `complemento`, `bairro` | varchar | Endereço completo |
| `nivel` | varchar(20) | `iniciante|bronze|prata|ouro|diamante` |
| `pontos` | int | Gamificação |
| `volume_mes_atual` | numeric(10,2) | Atualizado a cada pedido aprovado |
| `volume_mes_anterior` | numeric(10,2) | |
| `total_vendido` | numeric(10,2) | Histórico acumulado |
| `meses_consecutivos` | int | Streak de pedidos mensais |
| `percentual_desconto` | numeric(4,2) | Desconto atual calculado pelo nível |
| `pedido_minimo` | numeric(10,2) | Valor mínimo por pedido |
| `status` | varchar(20) | `pendente|ativa|inativa|suspensa` |
| `otp_hash` | text | Hash bcrypt do OTP de login |
| `otp_expira_em` | timestamptz | Expiração do OTP (10 min) |
| `portal_token` | varchar | Token de acesso direto ao portal (90 dias) |
| `portal_token_expira_em` | timestamptz | |
| `customer_id` | uuid FK | Vincula ao CRM `crm.customers` |
| `aprovada_em` | timestamptz | Data da aprovação pelo admin |

### Tabelas relacionadas

| Tabela | Descrição |
|--------|-----------|
| `crm.revendedora_pedidos` | Pedidos do programa: número, status, subtotal, desconto, total |
| `crm.revendedora_pedido_itens` | Itens do pedido: produto, qtd, preço, preço com desconto |
| `crm.revendedora_estoque` | Estoque pessoal da revendedora |
| `crm.revendedora_conquistas` | Badges gamificados desbloqueados |
| `crm.revendedora_pedido_mensagens` | Thread de mensagens por pedido (autor_tipo: `admin|revendedora`) |

---

## API — endpoints completos

### CRM (autenticado — JWT CRM)

```
GET  /api/revendedoras                          lista com filtros (search, nivel, status)
POST /api/revendedoras                          criar revendedora (dispara email boas-vindas)
GET  /api/revendedoras/stats                    totais + distribuição por nível
GET  /api/revendedoras/pedidos-recentes         últimos 10 pedidos para sininho CRM
GET  /api/revendedoras/email-templates          lista os 3 templates editáveis
PUT  /api/revendedoras/email-templates/:slug    atualiza assunto + HTML de um template
GET  /api/revendedoras/:id                      perfil completo com KPIs + progresso nível
PUT  /api/revendedoras/:id                      atualizar dados da revendedora
PUT  /api/revendedoras/:id/status               ativar/suspender/inativar
GET  /api/revendedoras/:id/pedidos              pedidos com mensagens_nao_lidas
POST /api/revendedoras/:id/pedidos              criar pedido
PUT  /api/revendedoras/:id/pedidos/:id/status   mudar status (envia email automático)
GET  /api/revendedoras/:id/pedidos/:id/mensagens  thread de mensagens
POST /api/revendedoras/:id/pedidos/:id/mensagens  admin envia mensagem (email + sininho)
GET  /api/revendedoras/:id/estoque              estoque pessoal
POST /api/revendedoras/:id/estoque              adicionar item ao estoque
PUT  /api/revendedoras/:id/estoque/:itemId      atualizar item
DELETE /api/revendedoras/:id/estoque/:itemId    remover item
GET  /api/revendedoras/:id/conquistas           conquistas desbloqueadas
POST /api/revendedoras/:id/conquistas           conceder conquista manualmente
POST /api/revendedoras/:id/gerar-token          gerar token portal 90 dias
```

### Portal Sou Parceira (JWT com `iss:"souparceira"`)

```
POST /api/souparceira/login                     autenticação (CPF → OTP → JWT)
GET  /api/souparceira/perfil                    dados + nível + progresso
GET  /api/souparceira/catalogo                  catálogo com preços calculados
POST /api/souparceira/pedidos                   criar pedido (preço server-side)
GET  /api/souparceira/pedidos                   meus pedidos com mensagens_nao_lidas
GET  /api/souparceira/pedidos/:id               detalhe + itens (marca msgs admin como lidas)
GET  /api/souparceira/pedidos/:id/mensagens     thread de mensagens
POST /api/souparceira/pedidos/:id/mensagens     revendedora envia mensagem
```

---

## Cálculo de preço (server-side)

O preço nunca é aceito do body do pedido. É sempre recalculado no servidor:

```typescript
preco_com_desconto = preco_custo × markup × (1 - desconto / 100)
```

- `preco_custo` — custo de aquisição do produto (nunca exposto à revendedora)
- `markup` — markup padrão da categoria do catálogo JC (default: 2.00 = 100% de margem)
- `desconto` — percentual do tier da revendedora (15–45%)

O `preco_unitario` exibido no catálogo para a revendedora é o preço de revenda sugerido (após desconto), sem expor o custo.

---

## Catálogo de produtos

Os produtos vêm do catálogo JC Atacado (`sync.fornecedor_catalogo_jc`), importados via scraper do site atacadojc.com.br.

Apenas produtos com `status = 'aprovado'` aparecem no portal.

Curadoria pelo admin em: CRM → Catálogo JC → aba Curadoria.

---

## Segurança

- **Preço server-side:** `preco_unitario` do body é ignorado — recalculado sempre
- **Isolamento:** revendedora só acessa seus próprios pedidos/estoque (filtragem por `revendedora_id`)
- **OTP:** hash bcrypt + expiração 10 min + sem revelar se CPF existe
- **JWT iss:** portal usa `iss: "souparceira"` — token CRM não funciona no portal e vice-versa
- **Sem exposição de custo:** `preco_custo` nunca retornado nas rotas do portal

---

## Arquivos principais

| Arquivo | Responsabilidade |
|---------|-----------------|
| `api/src/routes/revendedoras.ts` | CRUD admin + pedidos + mensagens + email builders + endpoints email-templates |
| `api/src/routes/portal-souparceira.ts` | Portal da revendedora: auth OTP, perfil, catálogo, pedidos, mensagens |
| `frontend/src/pages/Revendedoras.tsx` | Lista CRM + stats + modal editor de emails |
| `frontend/src/pages/RevendedoraPerfil.tsx` | Perfil individual: KPIs, pedidos, estoque, conquistas, thread |
| `frontend/src/pages/PortalRevendedora.tsx` | Portal público da revendedora (sem auth CRM) |
| `frontend/src/pages/SouParceira.tsx` | Landing page / formulário de cadastro |
| `db/migrations/032_revendedoras.sql` | Schema base: tabelas + índices |
| `db/migrations/036_revendedoras_endereco.sql` | Campos de endereço |
| `db/migrations/038_revendedora_mensagens_notificacoes.sql` | Thread de mensagens + notificações |
| `db/migrations/039_nivel_iniciante.sql` | Nível Iniciante + campos OTP |
| `db/migrations/040_nivel_diamante.sql` | Nível Diamante + ajuste de percentuais |
| `db/migrations/041_email_templates_revendedoras.sql` | Slug em marketing.templates + 3 templates editáveis |

---

*Última atualização: 13 de Abril de 2026*
