# BibeloCRM — Roadmap por Fases

Documento de planejamento estrategico do ecossistema Bibelo.
Atualizado em: 27/03/2026

---

## Fase 1: ERP + CRM (ATUAL)

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
- [x] Financeiro: fluxo de caixa, lancamentos, dashboard
- [x] Despesas Fixas: controle vencimentos, pagamentos mensais
- [x] Simulador de Custos: marketplace, embalagens, kits
- [x] NF de Entrada: upload XML, parse automatico, contabilizacao

### Pendente (Fase 1)
- [ ] Pipeline/Deals (kanban de negociacoes)
- [ ] WhatsApp API (Evolution API) — implementar mas NAO ativar agora
- [ ] Pagina detalhe do produto (vendas, estoque deposito, historico)
- [ ] Exportar relatorios (CSV/PDF)
- [ ] Ajustes finos de UX (filtros, ordenacao, responsividade)

### Decisoes tecnicas
- **NuvemShop webhooks**: DEPRIORITIZADO — dados ja vem via sync Bling (mesmos pedidos). Webhook so daria tempo real vs 30min delay. Nao justifica agora.
- **WhatsApp**: Implementar integracao com Evolution API (self-hosted), mas sem ativar envio. Deixar infraestrutura pronta para Fase 2.
- **Sync Bling**: Incremental a cada 30min via BullMQ. Rate limit 3 req/s.

---

## Fase 2: Marketing + Automacao (FUTURO)

Foco: campanhas, fluxos automaticos, comunicacao ativa com clientes.

### Escopo
- [ ] Campanhas de email (Resend) — disparo real com tracking abertura/clique
- [ ] Campanhas de WhatsApp — disparo via Evolution API
- [ ] Motor de fluxos automaticos (triggers + steps + condicoes)
  - Ex: "cliente comprou → espera 7d → envia email de avaliacao"
  - Ex: "cliente inativo 30d → envia WhatsApp com cupom"
  - Ex: "aniversario do cliente → envia parabens + desconto"
- [ ] Templates de email (editor visual)
- [ ] Templates de WhatsApp
- [ ] Metricas de campanha (abertura, clique, conversao, receita atribuida)
- [ ] Segmentacao dinamica para campanhas
- [ ] A/B testing em assuntos de email

### Pré-requisitos (da Fase 1)
- WhatsApp API configurada e testada
- Resend API key ativa
- Segmentos de clientes funcionando (ja feito)
- Templates de marketing no banco (tabelas ja existem)

---

## Fase 3: Robustez + Operacao (CONTINUO)

- [ ] Testes automatizados (pelo menos integracao nas rotas)
- [ ] Uptime Kuma (monitoramento 24/7)
- [ ] Backup automatico para Cloudflare R2
- [ ] Notificacao de deploy via WhatsApp
- [ ] Rate limit mais granular por rota
- [ ] Logs estruturados com busca (ELK ou similar)

---

## Regras de priorizacao

1. **Fase 1 primeiro** — nao iniciar Fase 2 ate concluir todos os itens pendentes de Fase 1
2. **Marketing separado** — tudo que envolve disparo de mensagem (email, WhatsApp, fluxos) fica na Fase 2
3. **WhatsApp e exceção** — a integracao tecnica (API, container, rotas) pode ser feita na Fase 1, mas sem ativar envio
4. **NuvemShop deprioritizado** — dados ja vem do Bling, nao precisa de webhook dedicado agora

---

*Bibelo CRM — Ecossistema Bibelo*
