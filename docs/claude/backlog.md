# Backlog técnico — BibelôCRM

Itens aguardando pré-requisito, dados suficientes ou momento certo para implementar.

---

## ✅ Item 4 — RESOLVIDO (23/04/2026)

~~Recomendação real nos emails de fluxo~~

O CF por nome de produto recomendava variantes de cor da mesma linha (ex: caneta azul → caneta rosa), sem valor de cross-sell.

**Solução implementada:** CF por `nome_base` — remove sufixos de variante (`Cor:`, `Tinta:`, `Cor/Estampa:`, `Miolo:` etc.) antes de calcular co-compras. Com 249 pedidos disponíveis, o resultado é real:
- Quem comprou Caneta BRW → recebe Cola Fita, Papel de Carta, Marca Texto
- Fallback usa produtos mais populares do período com o mesmo filtro

**Arquivo:** `api/src/services/flow.service.ts` — `buildCrossSellEmail()`

---

## ✅ Itens 1-6 — RESOLVIDOS (23/04/2026)

Melhoria completa da infraestrutura de email marketing:

1. **validateEmailContext** + migration `056_email_send_log` — bloqueia opt-out, email inválido, URL sem produto, cross-sell sem co-compras, recompra sem estoque Bling
2. **Audit de templates** — preheader em todos os templates principais, `toTitleCase()` para nomes ALL CAPS do Bling, guard de URL explícito para produto-visitado
3. **Fallback dual-provider** — Resend primário → SES fallback automático (sem intervenção manual). SES como primário quando `EMAIL_PROVIDER=ses` (pós-sandbox)
4. **Preview/Teste** — `GET /api/email/preview/:tipo/:customerId` e `POST /api/email/teste/:tipo/:customerId`
5. **17 testes** em `email-validation.test.ts` — bloqueios de contexto + estrutura HTML dos templates
6. **VIP context enrichment** — `vip.joined` enriquece metadata com últimos 3 produtos; `buildVipWelcomeEmail` usa saudação personalizada

## ✅ Sessão 23/04/2026 — URLs reais + fixes de qualidade

**Resolvido:**

1. `fetchProductUrls()` em `flow.service.ts` — resolução em 3 passos (cache NS → API com warm → nomeToSlug fallback). Emails de cross-sell e recompra agora incluem URLs reais de produto.
2. Guard `isValidSku()` — rejeita nome-como-SKU do Bling antes de chamar a API.
3. Validação de false positive NS API — descarta produto errado quando nenhum variant.sku bate.
4. `upsertCustomer()` — 3 níveis de proteção contra `customers_email_key` (pre-check + catch UPDATE + catch/merge INSERT). Fix para 3 contatos Bling que quebravam o sync a cada 30min.
5. Throttle 60s em `POST /api/email/teste/:tipo/:customerId` — retorna 429 em chamadas duplicadas.

**Testes:** 852/852 passando.

## ✅ Sessão 23/04/2026 (tarde) — visitor_id + paginação NS + cache URLs

**Resolvido:**

1. **visitor_id não vinculado no retorno de lead verificado** — `leads.ts`: no caminho `ja_verificado` (e `pendente`), visitor_id agora é sempre vinculado ao customer + tracking_events retroativamente atribuídos. Corrige sininho que não tocava para clientes retornantes com 4+ product views.
2. **`syncNsProducts()` 404 na paginação** — `nuvemshop/sync.ts`: NS retorna HTTP 404 (não `[]`) ao esgotar páginas. Fix captura 404 e faz `break`. 133 produtos sincronizados.
3. **Rota `POST /api/sync/nuvemshop/produtos`** — popula cache de URLs de produtos sob demanda.
4. **`customers_cpf_key`** — `customer.service.ts`: pre-check + catch para CPF duplicado no Bling sync (mesmos 2 contatos do email_key).
5. **`fetchProductUrls` sem `nomeToSlug` fallback** — `flow.service.ts`: remove geração de URLs via nome Bling (404s). Retorna `""` para SKUs não resolvidos.

**Mapeamento de casos similares:** todos os outros caminhos de visitor_id já estavam corretos (tracking `/identify`, webhook NuvemShop, landing pages chamam `/leads/capture`).

## Próximos itens de backlog

_Nenhum item pendente crítico no momento._
