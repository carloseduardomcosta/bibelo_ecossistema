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

## Personalização regional — frete grátis Sul/SE

Emails detectam automaticamente a região do cliente e personalizam a mensagem de frete.

**Arquivo:** `api/src/utils/regiao.ts` — `detectarRegiao()`, `bannerFretep()`, `itemFreteHtml()`, `textoFreteInline()`

**Fontes em ordem de prioridade:**
1. `crm.customers.estado` (UF) — mais confiável
2. DDD do `crm.customers.telefone` — ex: 47→SC, 11→SP
3. GeoIP do IP da requisição via `geoip-lite` — fallback

**Comportamento:**
- Sul/Sudeste (SC, PR, RS, SP, RJ, ES, MG): "🚚 Frete grátis para Sul e Sudeste acima de R$ 79!"
- Outras regiões (PA, BA, GO...): "📦 Entregamos para todo o Brasil!"
- Região desconhecida: exibe Sul/SE por padrão (maioria das clientes)

**Aplicado em:** 11 templates de fluxo, email de verificação de lead, página de confirmação, lembrete de verificação (cron).

## Dedup de template — anti-duplicidade cross-canal

Antes de executar qualquer step de email, o motor verifica se o cliente já recebeu o **mesmo template** nas últimas **72h**, tanto por fluxo quanto por campanha manual.

**Como funciona:**
- Consulta `crm.interactions` por `tipo = 'email_enviado'` + `metadata->>'template' = nome` OU `metadata->>'template_nome' = nome`
- Emails de fluxo registram `metadata.template` (nome do step)
- Campanhas regulares (`sendCampaignEmails`) registram `metadata.template_nome` (nome do template do banco)
- Se encontrar → step marcado `ignorado` (motivo: `template_recente`), fluxo avança via `proximo` ou `+1`

**Caso de uso:** Carlos dispara campanha "Novidades" manualmente → sistema não reenvio o step "Novidades da Semana" do fluxo de nutrição nos próximos 3 dias.

**Arquivos:** `flow.service.ts` (verificação + fix do campo template no caminho DB), `email.ts` (registro `template_nome` nas campanhas regulares)

## Regras gerais
- `triggerFlow` nunca re-executa (ignora se já existe execução dentro de 90 dias)
- Reativação só para quem tem pelo menos 1 pedido
- **Novo fluxo = preview obrigatório**: enviar para `carloseduardocostatj@gmail.com` antes de produção
- **Novo template = registrar** em `buildFlowEmail()` e `getFlowSubject()` — sem registro cai no fallback genérico
- Testes de email: SEMPRE em `carloseduardocostatj@gmail.com`
- Captura de lead vincula visitor_id ao customer
- Cada email de fluxo registra interação em `crm.interactions` com `metadata.template` (nome do step)
- Cupom só após verificação de email (HMAC link)
- Opt-out LGPD respeitado em campanhas e fluxos
- Descadastro notifica o admin por email
- IP real via `X-Forwarded-For` (proxy Docker 172.21.x)
- Busca de email sempre `LOWER(email) = LOWER($1)`
- `cleanProductUrl()`: remove fbclid/UTMs de ads, adiciona `utm_source=email&utm_medium=flow`
