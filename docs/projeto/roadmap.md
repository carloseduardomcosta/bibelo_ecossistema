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
- [ ] Conversor de imagens de produtos (WEBP → PNG/JPEG)

### Conversor de Imagens (detalhe)

**Problema:** As imagens dos produtos no Bling estao em WEBP. Marketplaces como Shopee NAO aceitam WEBP. O site oficial tem tamanhos inconsistentes. O Bling NAO permite atualizar imagens via API (confirmado pelo suporte).

**Solucao:** Ferramenta dentro do BibeloCRM que:
1. Puxa as imagens WEBP dos produtos do Bling (ja temos as URLs no sync)
2. Converte para PNG ou JPEG com qualidade otimizada
3. Padroniza tamanho (ex: 1000x1000px, fundo branco)
4. Disponibiliza download individual ou em lote (ZIP)
5. Organiza por categoria para facilitar upload manual nos marketplaces

**Limitacao:** Upload de volta para o Bling precisa ser manual (limitacao da API deles). A ferramenta so converte e disponibiliza o download.

**Formato recomendado:** PNG para fundo transparente, JPEG para fotos (menor tamanho). Oferecer os dois.

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
