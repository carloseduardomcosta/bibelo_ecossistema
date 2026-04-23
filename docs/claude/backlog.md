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

## Próximos itens de backlog

_Nenhum item pendente de pré-requisito no momento._
