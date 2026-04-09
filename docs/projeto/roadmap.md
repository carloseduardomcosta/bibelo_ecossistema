# BibeloCRM — Roadmap por Fases

Documento de planejamento estrategico do ecossistema Bibelo.
Atualizado em: 09/04/2026

---

## Fase 1: ERP + CRM — CONCLUIDA

Foco: gestao de clientes, produtos, estoque, financeiro e inteligencia de dados.

### Concluido
- [x] Login Google OAuth exclusivo
- [x] Dashboard CEO com KPIs, filtros de periodo, insights
- [x] Clientes: lista, perfil, score, timeline, segmentos
- [x] Produtos: lista com ordenacao, busca, filtro categoria/estoque
- [x] Estoque: resumo financeiro, alertas reposicao, drill-down por categoria
- [x] Lucratividade: receita vs custo, top produtos, margem por categoria
- [x] Segmentos: cards com metricas, drill-down por segmento
- [x] Sync Bling: contatos, pedidos (com itens), produtos (com categorias), estoque
- [x] Sync NuvemShop: clientes, pedidos, produtos — 9 webhooks real-time
- [x] Financeiro: fluxo de caixa, lancamentos, dashboard, DRE, fluxo projetado
- [x] Despesas Fixas: controle vencimentos, pagamentos mensais
- [x] Simulador de Custos: marketplace, embalagens, kits
- [x] NF de Entrada: upload XML, parse automatico, contabilizacao
- [x] Editor de Imagens: conversao WEBP/JPG/PNG, presets marketplace, envio Bling, remocao fundo IA
- [x] Google Reviews: Places API, cache DB 6h, widget JS NuvemShop
- [x] Pagina de Links: boasvindas.papelariabibelo.com.br (substitui Linktree)

---

## Fase 2: Marketing + Automacao — CONCLUIDA

Foco: campanhas, fluxos automaticos, comunicacao ativa com clientes.

### Concluido
- [x] Email dual provider: Amazon SES (primario) + Resend (fallback)
- [x] 23 templates de email com layout padrao Bibelo (emailWrapper)
- [x] Motor de fluxos automaticos com branching condicional (7 tipos de condicao)
- [x] 11 fluxos ativos: carrinho abandonado, nutricao lead, reativacao, produto visitado, lead quente, pos-compra, boas-vindas, cross-sell, carrinho tracking, recompra
- [x] Campanhas de email: disparo real, tracking abertura/clique, dashboard
- [x] Popup Clube Bibelo: captura leads na NuvemShop (email + WhatsApp)
- [x] Tracking comportamental: page_view, product_view, add_to_cart, search, checkout
- [x] Score de leads: engajamento automatico (popup, views, cart, emails)
- [x] Cupons unicos: geracao automatica na NuvemShop API (3 cenarios)
- [x] Opt-out LGPD: descadastro 1-click, respeitado em campanhas e fluxos
- [x] Webhook email events: open/click/bounce/complaint (SES + Resend)
- [x] Proxy de imagens: cache + conversao webp→jpg para compatibilidade Outlook/Yahoo
- [x] Landing pages para ads: 6 paginas ativas com vitrine dinamica
- [x] Meta Ads dashboard: KPIs, campanhas, demografico, geografico
- [x] Lembrete de verificacao: cron 2h para leads nao verificados (max 2 lembretes)
- [x] UTM tracking: captura e persistencia de parametros de campanha

---

## Fase 3: E-commerce Proprio + Robustez — EM ANDAMENTO

Foco: loja propria (substituir NuvemShop), infraestrutura solida, monitoramento.

### Concluido
- [x] Medusa.js v2: 373 produtos sincronizados do Bling, Admin Dashboard ativo
- [x] Sync Bling → Medusa: CRM como hub, BullMQ 30min, dedup SKU
- [x] Mercado Pago Pix: checkout transparente, webhook HMAC validado
- [x] Melhor Envio: PAC+SEDEX via API, etiquetas automaticas
- [x] Medusa → Bling pedidos: subscriber bidirecional confirmado
- [x] Next.js Storefront v2: carrinho funcional, categorias dinamicas, carrossel, UX mobile
- [x] Testes automatizados: Vitest + Supertest, 306+ testes, 18 suites
- [x] CI/CD: GitHub Actions → rsync → testes na VPS → deploy → health check
- [x] Uptime Kuma: 11 monitores, 2 canais alerta
- [x] Backup automatico: diario Google Drive (rclone), DR semanal
- [x] Hardening VPS/Nginx: SSH, headers seguranca, Docker limits, rate limits, DMARC reject
- [x] Cloudflare Access: Zero Trust no CRM, login Google obrigatorio
- [x] Otimizacao sync Bling: ~110 → ~30 req/ciclo

### Pendente (Fase 3)
- [ ] Storefront v2: checkout completo (endereco, frete, pagamento)
- [ ] Storefront v2: conta do cliente (pedidos, enderecos, perfil)
- [ ] Storefront v2: busca de produtos
- [ ] Storefront v2: SEO (meta tags, sitemap, structured data)
- [ ] Storefront v2: ir para producao (substituir NuvemShop)
- [ ] WhatsApp oficial: Chatwoot + Meta Cloud API + Instagram DM (aguardando nova linha celular)
- [ ] Sync audiences CRM → Meta Ads (fase 2 da integracao Meta)

---

## Fase 4: Supply Chain Management (SCM) — FUTURO

Foco: gestao da cadeia de suprimentos — compra inteligente, reposicao automatica, controle de fornecedores.

### Contexto
O CRM (relacionamento) e o ERP (operacao) ja estao maduros. O SCM fecha o ciclo:
**fornecedor → estoque → venda → cliente → recompra → fornecedor**

### Base que ja existe
- NF de Entrada (financeiro.notas_entrada) — custos reais de compra
- Estoque do Bling — quantidades e depositos
- Alertas de reposicao — pagina Estoque com estoque minimo
- Custos de embalagem — financeiro.custos_embalagem
- Fornecedores — cadastro no Bling (contatos tipo fornecedor)
- Historico de vendas — sync.bling_orders com itens

### Schema proposto: `supply`

```sql
-- Fornecedores (enriquecido do Bling)
supply.fornecedores
  bling_id, nome, cnpj, contato, prazo_medio_dias, score_confiabilidade,
  ultimo_pedido_em, total_pedidos, observacoes

-- Pedidos de compra
supply.pedidos_compra
  fornecedor_id, status (rascunho/enviado/confirmado/recebido),
  valor_total, frete, prazo_entrega, enviado_em, recebido_em

supply.pedidos_compra_itens
  pedido_compra_id, produto_bling_id, quantidade, preco_unitario

-- Ponto de pedido automatico
supply.ponto_pedido
  produto_bling_id, estoque_minimo, velocidade_venda_dia,
  lead_time_dias, quantidade_sugerida, proximo_pedido_em

-- Historico de precos por fornecedor
supply.preco_historico
  produto_bling_id, fornecedor_id, preco, data, nf_entrada_id
```

### Modulos planejados

| Modulo | Descricao | Prioridade |
|--------|-----------|-----------|
| Curva ABC | 20% dos produtos = 80% da receita. Foco de reposicao nos A | P0 |
| Ponto de pedido | Estoque minimo + velocidade venda + lead time = alerta automatico | P0 |
| Historico preco/fornecedor | Evolucao de custo por produto, comparativo entre fornecedores | P1 |
| Pedido de compra | Gerar PO, acompanhar status, vincular com NF entrada ao receber | P1 |
| Score de fornecedor | Prazo, qualidade, preco — ranking automatico | P2 |
| Previsao de ruptura | Cruzar velocidade venda × estoque × lead time → "vai faltar em X dias" | P2 |
| Sazonalidade | Detectar padroes (agendas jan, volta aulas fev, natal dez) | P3 |

### Beneficios esperados
1. **Nunca faltar produto quente** — alerta antes de zerar
2. **Comprar melhor** — saber qual fornecedor tem melhor preco/prazo
3. **Menos capital parado** — nao comprar demais o que nao gira (curva C)
4. **Margem real atualizada** — custo automatico pela NF de entrada
5. **Autonomia operacional** — Julia/Carlos sabem o que pedir sem planilha

### Pre-requisitos
- Fase 3 estavel (storefront em producao)
- NF de Entrada com parse de fornecedor (ja existe)
- Sync Bling fornecedores (ja existe parcialmente)

---

## Regras de priorizacao

1. **Fase 3 em andamento** — storefront v2 ate producao
2. **Fase 4 so inicia** quando e-commerce proprio estiver rodando
3. **WhatsApp** — aguardando nova linha celular do Carlos
4. **SCM comeca pela curva ABC** — baixa complexidade, alto impacto

---

*Bibelo CRM — Ecossistema Bibelo*
