# Regras de negócio — emails e fluxos

Documentação completa: `docs/marketing/email-templates.md` — todos os 23 templates, fluxos, layout, proxy.

## Motor condicional
Steps tipo "condicao" avaliam 7 tipos: `email_aberto`, `email_clicado`, `comprou`, `visitou_site`, `viu_produto`, `abandonou_cart`, `score_minimo` → branching (sim/nao → targetIndex)

## 11 fluxos ativos
carrinho abandonado (12), nutrição lead (12), reativação (10), produto visitado (10), lead quente (10), pós-compra (8), boas-vindas 1ª compra (3), lead boas-vindas (1), cross-sell (6), carrinho tracking (4), recompra (4)

## 23 templates de email
Todos usam `emailWrapper()` (header/footer padrão Bibelô), `escHtml()` em nomes, proxy de imagens webp→jpg.

## NuvemShop vs CRM
- NuvemShop = transacionais (confirmações, segurança)
- CRM = marketing/nurture/recuperação
- Carrinho: NuvemShop ~30min (toque leve) + CRM 2h+ (fluxo completo). Sem duplicação.

## Triggers sem fluxo (de propósito)
- `customer.created` — NuvemShop já envia boas-vindas conta
- `order.delivered` — candidato futuro avaliação pós-entrega

## Lembrete de verificação de lead
Cron 2h reenvia confirmação para leads não verificados. 1º lembrete 3h, 2º (último) 24h.
Campos: `lembretes_enviados`, `ultimo_lembrete_em` em `marketing.leads`

## Proxy de imagens
`proxyImageUrl()` em `email.ts` — cacheia + converte webp→jpg via Sharp (Outlook/Yahoo não suportam webp).
URL: `webhook.papelariabibelo.com.br/api/email/img/{hash}.jpg`

## Cupons únicos
`gerarCupomUnico()` cria `BIB-NOME-XXXX` na NuvemShop API (max_uses:1, first_consumer_purchase:true)
- Carrinho abandonado: 5%, 24h
- Nutrição lead: 10%, 48h
- Reativação: 10%, 7d
- Popup Clube Bibelô: `BIBELO10` = 10% OFF na 1ª compra (cupom estático NuvemShop, max_uses:5000)

## Frete grátis
Configuração nativa NuvemShop (Sul/Sudeste, R$79+, opção mais barata) — não depende de cupom.
Banner presente em todos os emails de carrinho/produto.

## Regras gerais
- `triggerFlow` nunca re-executa (ignora se já existe execução dentro de 90 dias)
- Reativação só para quem tem pelo menos 1 pedido
- **Novo fluxo = preview obrigatório**: enviar para `carloseduardocostatj@gmail.com` antes de produção
- **Novo template = registrar** em `buildFlowEmail()` e `getFlowSubject()` — sem registro cai no fallback genérico
- Testes de email: SEMPRE em `carloseduardocostatj@gmail.com`
- Captura de lead vincula visitor_id ao customer
- Cada email de fluxo registra interação em `crm.interactions`
- Cupom só após verificação de email (HMAC link)
- Opt-out LGPD respeitado em campanhas e fluxos
- Descadastro notifica o admin por email
- IP real via `X-Forwarded-For` (proxy Docker 172.21.x)
- Busca de email sempre `LOWER(email) = LOWER($1)`
- `cleanProductUrl()`: remove fbclid/UTMs de ads, adiciona `utm_source=email&utm_medium=flow`
