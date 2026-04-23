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

## Próximos itens de backlog

_Nenhum item pendente de pré-requisito no momento._
