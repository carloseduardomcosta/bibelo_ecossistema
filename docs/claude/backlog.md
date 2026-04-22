# Backlog técnico — BibelôCRM

Itens aguardando pré-requisito, dados suficientes ou momento certo para implementar.
Cada item tem uma condição objetiva de "pronto para retomar".

---

## Item 4 — Recomendação real nos emails de fluxo

**Registrado em:** 22 de Abril de 2026
**Contexto:** `crm.order_items` foi criada na sessão de hoje (migration 054) com 710 itens backfillados. Precisa acumular 2–4 semanas de pedidos reais antes de implementar para que o collaborative filtering tenha dados significativos.

**Pré-requisito para retomar:**
```sql
SELECT COUNT(DISTINCT order_id) FROM crm.order_items
WHERE criado_em > NOW() - INTERVAL '14 days';
-- Retornar > 50 pedidos novos = base pronta
```

### O que implementar

**1. `buildCrossSellEmail()` em `api/src/services/flow.service.ts`**
- Substituir query atual por: clientes que compraram nos mesmos `order_id`s que o cliente atual → produtos mais frequentes = recomendação (collaborative filtering)
- Incluir `image_url` de `crm.order_items` (vem do NuvemShop — já preenchida)
- Link direto para o produto, não para a home

**2. `buildProductVisitedEmail()` em `api/src/services/flow.service.ts`**
- Passar `resource_id` e `resource_url` do `tracking_event` para o template
- Hoje o link leva para a home — passar a levar para o produto exato
- Incluir quantas vezes o cliente viu o produto (já disponível em `crm.tracking_events`)

**3. `checkRepurchaseDue()` em `api/src/services/flow.service.ts`**
- Já refatorada para usar `crm.order_items` (feito na sessão 22/04)
- Validar se os produtos sugeridos têm estoque > 0 antes de incluir no email
- Cruzar `sku` com `sync.bling_stock` (tabela já existe, dados atualizados pelo sync incremental)

**Arquivos a modificar:**
- `api/src/services/flow.service.ts` (funções: `buildCrossSellEmail`, `buildProductVisitedEmail`, `checkRepurchaseDue`)
- Templates de email relevantes (cross-sell, produto visitado, recompra)
