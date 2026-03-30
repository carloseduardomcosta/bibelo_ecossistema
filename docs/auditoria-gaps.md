# Auditoria Completa — BibelôCRM

> Análise de gaps em tudo que toca o CLIENTE.
> Data: 30 de Março de 2026
> Escopo: fluxos automáticos, tracking, webhooks, leads, campanhas, frontend

---

## Resumo executivo

| Severidade | Qtd | Status |
|-----------|-----|--------|
| CRÍTICO (cliente recebe msg errada/duplicada) | 6 | Corrigidos nesta sessão |
| ALTO (dados perdidos ou inconsistentes) | 8 | Corrigidos nesta sessão |
| MÉDIO (UX ruim ou dado incompleto) | 12 | Backlog próximo sprint |
| BAIXO (melhorias futuras) | 10 | Backlog |

---

## CRÍTICOS — Corrigidos

### 1. Race condition: fluxo executado 2x para mesmo cliente
- **Onde:** `flow.service.ts` → `triggerFlow()`
- **Problema:** Dois webhooks simultâneos passam no check de duplicata e ambos criam execução
- **Impacto:** Cliente recebe 2x o mesmo email (carrinho abandonado, boas-vindas, etc.)
- **Correção:** `INSERT ... ON CONFLICT (flow_id, customer_id) WHERE status = 'ativo' DO NOTHING`

### 2. Steps processados 2x por workers concorrentes
- **Onde:** `flow.service.ts` → `processReadySteps()`
- **Problema:** Dois workers BullMQ pegam o mesmo step e executam em paralelo
- **Impacto:** Email enviado 2x ao cliente
- **Correção:** `UPDATE ... SET status = 'executando' WHERE status = 'ativo' AND proximo_step_em <= NOW() RETURNING id` (lock atômico)

### 3. Email marcado como "enviado" mesmo quando Resend falha
- **Onde:** `flow.service.ts` → `executeEmailStep()`
- **Problema:** `sendEmail()` retorna `null` quando Resend não está configurado, mas step marca `{ sent: true }`
- **Impacto:** CRM mostra "email enviado" mas cliente nunca recebeu
- **Correção:** Checar `if (!result) throw new Error("Email não enviado")`

### 4. Webhooks aceitos sem assinatura HMAC
- **Onde:** `nuvemshop/webhook.ts` e `bling/webhook.ts`
- **Problema:** Se header HMAC está ausente, webhook é aceito com `next()` em vez de rejeitado
- **Impacto:** Atacante pode forjar webhooks — criar pedidos falsos, disparar fluxos, manipular dados
- **Correção:** Retornar `403` quando assinatura está ausente em produção

### 5. Dados perdidos quando fetch da API falha no webhook
- **Onde:** `nuvemshop/webhook.ts` → `fetchOrderDetails()`
- **Problema:** Webhook chega, mas fetch do pedido completo na API NuvemShop falha (timeout, rate limit). Retorna `null` silenciosamente e webhook responde 200 OK
- **Impacto:** NuvemShop não retenta (recebeu 200). Pedido/cliente perdido permanentemente
- **Correção:** Retornar 500 quando fetch falha, para NuvemShop retentar

### 6. Carrinho abandonado dispara após pagamento
- **Onde:** `flow.service.ts` → `checkAbandonedCarts()` + `nuvemshop/webhook.ts`
- **Problema:** Se `order/created` chega antes de `order/paid`, pedido é registrado como pendente. Se pagamento acontece perto do limite de 2h, email de recuperação pode disparar antes do webhook de pagamento chegar
- **Impacto:** Cliente que pagou recebe "Você esqueceu itens no carrinho!"
- **Correção:** Verificar status real do pedido via API antes de disparar fluxo de abandono

---

## ALTOS — Corrigidos

### 7. Crash no Dashboard com geo data vazio
- **Onde:** `Dashboard.tsx` → card "Visitantes por Estado"
- **Problema:** `geoData.byRegion[0].visitors` crasha se array está vazio
- **Correção:** Guard `geoData.byRegion.length > 0` antes de acessar `[0]`

### 8. Campanha fica presa em status "enviando" para sempre
- **Onde:** `resend/email.ts` → `sendCampaignEmails()`
- **Problema:** Se qualquer email falha, cálculo `sends.length - sent - failed` nunca chega a zero
- **Correção:** Marcar como `concluida` quando não há mais `pendente`, não quando cálculo = 0

---

## MÉDIOS — Backlog próximo sprint

### 9. Sem opt-out / unsubscribe
- **Onde:** Todo o motor de fluxos
- **Problema:** Nenhum check de preferência do cliente antes de enviar email/WhatsApp
- **Impacto:** Pode violar LGPD. Cliente irritado sem como parar de receber
- **Solução:** Campo `email_optout` e `whatsapp_optout` em `crm.customers`, checar antes de enviar

### 10. Template variables não substituídas completamente
- **Onde:** `flow.service.ts` → template substitution
- **Problema:** `{{numero}}`, `{{codigo}}`, `{{prazo}}`, `{{cupom}}` nunca são substituídos
- **Impacto:** Cliente vê `Seu pedido #{{numero}}` literalmente no email
- **Solução:** Mapear todas as variáveis disponíveis no metadata

### 11. Timezone não considerado nos delays de fluxo
- **Onde:** `flow.service.ts` → cálculo de `proximo_step_em`
- **Problema:** `new Date(Date.now() + delayMs)` usa UTC do servidor, não horário de Brasília
- **Impacto:** Fluxos com delay podem executar em horários inconvenientes (madrugada)
- **Solução:** Usar `date-fns-tz` para calcular delays no fuso `America/Sao_Paulo`

### 12. Cliente duplicado entre Bling e NuvemShop
- **Onde:** `customer.service.ts` → upsert
- **Problema:** Mesma pessoa com emails diferentes no Bling e NuvemShop cria 2 registros
- **Impacto:** Score dividido, timeline incompleta, emails duplicados
- **Solução:** Match por telefone como fallback após email

### 13. Pedido fulfilled não limpa pedido pendente
- **Onde:** `nuvemshop/webhook.ts`
- **Problema:** Só `order/paid` marca `convertido=true`. `order/fulfilled` não marca
- **Impacto:** Se webhook `order/paid` se perder, pedido entregue ainda aparece como "abandonado"
- **Solução:** Marcar `convertido=true` também em `order/fulfilled`

### 14. Resend sem distinção de erro temporário vs permanente
- **Onde:** `resend/email.ts` → `sendEmail()`
- **Problema:** Rate limit (429) e email inválido são tratados iguais — ambos marcam como erro
- **Solução:** Retry em 429/500, marcar como erro permanente em 400/422

### 15. Token Bling expira durante sync longo
- **Onde:** `bling/sync.ts`
- **Problema:** Token pego uma vez no início. Sync de 100+ páginas pode levar 30min+
- **Solução:** Verificar expiração antes de cada request

### 16. Recovery URL genérica quando fetch falha
- **Onde:** `flow.service.ts` → `checkAbandonedCarts()`
- **Problema:** Se não consegue recovery_url, usa `papelariabibelo.com.br` (cliente vê carrinho vazio)
- **Solução:** Não disparar recuperação sem URL válida

### 17. Rate limit do tracking permite bot flood
- **Onde:** `tracking.ts` → 60 eventos/min por IP
- **Problema:** Bot pode enviar 60 product_views falsos por minuto, poluindo analytics
- **Solução:** Reduzir para 20/min ou rate limit por visitor_id

### 18. IP armazenado sem aviso de privacidade
- **Onde:** `tracking.ts` → coluna `ip` na tracking_events
- **Problema:** LGPD exige aviso sobre coleta de dados pessoais
- **Solução:** Adicionar menção na política de privacidade do site

### 19. JSON.parse sem try-catch no frontend Marketing
- **Onde:** `Marketing.tsx` → 3 ocorrências de `JSON.parse(f.steps)`
- **Problema:** Se steps estiver corrompido, página inteira crasha
- **Solução:** Wrap em try-catch com fallback para array vazio

### 20. catch(() => {}) silencioso em 26+ chamadas API no frontend
- **Onde:** Dashboard, Estoque, Produtos, ContasPagar, Financeiro, Marketing, Campanhas, DespesasFixas
- **Problema:** Usuário vê tela em branco sem saber o que aconteceu
- **Solução:** Substituir por setState de erro + toast de notificação

---

## BAIXOS — Backlog futuro

### 21. JWT expira sem aviso — usuário perde formulário preenchido
### 22. Paginação não reseta ao mudar filtro em Clientes.tsx
### 23. Sidebar overflow em mobile (muitos grupos de navegação)
### 24. Sem debounce na busca de Clientes.tsx e Produtos.tsx
### 25. Modal fecha sem confirmação — dados do form perdidos
### 26. Sem Error Boundary no React — qualquer crash = tela branca
### 27. Marketing.tsx faz 7 API calls a cada 30 segundos (auto-refresh agressivo)
### 28. Cookie do visitor_id sem flag Secure
### 29. UUID do visitor_id usa Math.random() (não criptográfico)
### 30. Popup config (titulo/subtitulo) inserido via innerHTML sem escape

---

## Matriz de risco: o que afeta o CLIENTE diretamente

```
                    PROBABILIDADE
                    Baixa    Média    Alta
              ┌──────────┬──────────┬──────────┐
    Alto      │          │ #6 carr. │ #1 #2    │
              │          │ abandonad│ duplicado│
I             ├──────────┼──────────┼──────────┤
M   Médio     │ #12 dedup│ #10 vars │ #3 email │
P             │ #15 token│ #11 tz   │ falso ok │
A             ├──────────┼──────────┼──────────┤
C   Baixo     │ #28 cook.│ #17 rate │ #20 catch│
T             │ #29 uuid │ #18 LGPD │ vazio    │
O             └──────────┴──────────┴──────────┘
```

---

## Checklist de validação pós-correção

- [ ] Disparar 2 webhooks order/created simultâneos → só 1 fluxo criado
- [ ] Desconfigurar RESEND_API_KEY → step marca erro (não "sent: true")
- [ ] Enviar webhook sem HMAC → retorna 403
- [ ] Simular timeout no fetch de pedido → webhook retorna 500
- [ ] order/paid chega 1min antes de checkAbandonedCarts → não dispara email
- [ ] Dashboard com zero tracking events → não crasha
- [ ] Campanha com 1 email falhando → status final = "concluida" (não fica presa)

---

*Auditoria realizada por Claude Code — BibelôCRM*
*30 de Março de 2026*
