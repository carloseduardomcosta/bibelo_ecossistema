---
name: briefing
description: Briefing diário do BibelôCRM — atividade do site, leads, fluxos automáticos, vendas e alertas das últimas 24h
disable-model-invocation: false
argument-hint: [periodo-horas]
allowed-tools: Read, Glob, Grep, Bash
---

# Briefing Diário — BibelôCRM

Gere um briefing completo das **últimas 24 horas** (ou o período em $ARGUMENTS horas, se especificado) consultando o banco de dados real via Docker.

**IMPORTANTE**: Toda saída DEVE ser em português brasileiro (pt-BR).

## Dados a consultar

Execute os comandos SQL via `docker compose exec -T postgres psql -U bibelocrm bibelocrm -c "..."` no diretório `/opt/bibelocrm`.

### Schema das tabelas (nomes reais das colunas)

- `crm.tracking_events`: evento (varchar), visitor_id, pagina, resource_nome, resource_preco, geo_region, geo_city, geo_country, criado_em, utm_source/medium/campaign
- `marketing.leads`: email, nome, telefone, fonte, email_verificado, convertido, criado_em, visitor_id
- `marketing.flow_executions`: flow_id, customer_id, status ('ativo'/'concluido'), iniciado_em, proximo_step_em
- `marketing.flow_step_executions`: execution_id, tipo, status, executado_em, criado_em
- `marketing.flows`: nome, gatilho, ativo
- `sync.nuvemshop_orders`: ns_id, valor, status, webhook_em
- `sync.bling_orders`: bling_id, valor, status, canal, criado_bling
- `marketing.pedidos_pendentes`: ns_order_id, valor, criado_em, convertido, notificado, recovery_url
- `crm.customers`: nome, email, email_optout, email_optout_em, atualizado_em
- `sync.sync_logs`: fonte, tipo, status, registros, erro, criado_em

### 1. Visitantes e Tracking
```sql
SELECT COUNT(DISTINCT visitor_id) as visitantes_unicos, COUNT(*) as total_eventos,
  COUNT(*) FILTER (WHERE evento = 'page_view') as page_views,
  COUNT(*) FILTER (WHERE evento = 'product_view') as produto_views,
  COUNT(*) FILTER (WHERE evento = 'add_to_cart') as add_to_cart,
  COUNT(*) FILTER (WHERE evento = 'checkout') as checkouts,
  COUNT(*) FILTER (WHERE evento = 'purchase') as compras
FROM crm.tracking_events WHERE criado_em >= NOW() - INTERVAL '24 hours';

SELECT resource_nome as produto, COUNT(*) as views FROM crm.tracking_events
WHERE evento = 'product_view' AND criado_em >= NOW() - INTERVAL '24 hours' AND resource_nome IS NOT NULL
GROUP BY resource_nome ORDER BY views DESC LIMIT 5;

SELECT geo_region as estado, COUNT(DISTINCT visitor_id) as visitantes FROM crm.tracking_events
WHERE criado_em >= NOW() - INTERVAL '24 hours' AND geo_region IS NOT NULL
GROUP BY geo_region ORDER BY visitantes DESC LIMIT 5;
```

### 2. Leads capturados
```sql
SELECT COUNT(*) as novos_leads,
  COUNT(*) FILTER (WHERE email_verificado = true) as verificados,
  COUNT(*) FILTER (WHERE convertido = true) as convertidos
FROM marketing.leads WHERE criado_em >= NOW() - INTERVAL '24 hours';

SELECT nome, email, fonte, email_verificado, criado_em FROM marketing.leads
WHERE criado_em >= NOW() - INTERVAL '24 hours' ORDER BY criado_em DESC LIMIT 10;
```

### 3. Fluxos automáticos
```sql
SELECT f.nome, fe.status, COUNT(*) as total FROM marketing.flow_executions fe
JOIN marketing.flows f ON f.id = fe.flow_id
WHERE fe.iniciado_em >= NOW() - INTERVAL '24 hours'
GROUP BY f.nome, fe.status ORDER BY f.nome, total DESC;

SELECT f.nome as fluxo, fse.tipo, fse.status, COUNT(*) as total
FROM marketing.flow_step_executions fse
JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
JOIN marketing.flows f ON f.id = fe.flow_id
WHERE fse.executado_em >= NOW() - INTERVAL '24 hours'
GROUP BY f.nome, fse.tipo, fse.status ORDER BY total DESC;
```

### 4. Pedidos / Vendas
```sql
SELECT COUNT(*) as total_pedidos, COALESCE(SUM(valor), 0) as receita_total,
  ROUND(COALESCE(AVG(valor), 0), 2) as ticket_medio
FROM sync.nuvemshop_orders WHERE webhook_em >= NOW() - INTERVAL '24 hours';

SELECT COUNT(*) as total_pedidos, COALESCE(SUM(valor), 0) as receita_total
FROM sync.bling_orders WHERE criado_bling >= NOW() - INTERVAL '24 hours';
```

### 5. Carrinhos abandonados
```sql
SELECT COUNT(*) as carrinhos,
  COUNT(*) FILTER (WHERE convertido = true) as convertidos,
  COUNT(*) FILTER (WHERE notificado = true) as notificados
FROM marketing.pedidos_pendentes WHERE criado_em >= NOW() - INTERVAL '24 hours';
```

### 6. Opt-outs
```sql
SELECT COUNT(*) as descadastros FROM crm.customers
WHERE email_optout = true AND email_optout_em >= NOW() - INTERVAL '24 hours';
```

### 7. Sync status
```sql
SELECT fonte, tipo, status, registros, erro, criado_em FROM sync.sync_logs
WHERE criado_em >= NOW() - INTERVAL '24 hours' ORDER BY criado_em DESC LIMIT 10;
```

### 8. Próximas automações
```sql
SELECT f.nome as fluxo, fe.proximo_step_em, c.nome as cliente
FROM marketing.flow_executions fe
JOIN marketing.flows f ON f.id = fe.flow_id
LEFT JOIN crm.customers c ON c.id = fe.customer_id
WHERE fe.status = 'ativo' AND fe.proximo_step_em IS NOT NULL
  AND fe.proximo_step_em <= NOW() + INTERVAL '12 hours'
ORDER BY fe.proximo_step_em ASC LIMIT 15;
```

## Formato de saída

```
## Briefing BibelôCRM — [data de hoje]

### Site (últimas 24h)
- X visitantes únicos | Y page views | Z produtos visualizados
- Top produtos: [lista]
- Funil: X visitantes → Y produto → Z carrinho → W checkout → N compras
- Top estados: [lista]

### Leads
- X novos leads | Y verificados | Z convertidos
- [lista dos leads recentes se houver]

### Vendas
- NuvemShop: X pedidos | R$ Y receita | R$ Z ticket médio
- Bling: X pedidos | R$ Y receita
- Carrinhos abandonados: X detectados | Y recuperados

### Automações executadas
- [tabela: fluxo | ação | status | quantidade]

### Próximas automações (12h)
- [lista: horário | fluxo | cliente | ação]

### Syncs
- [status das sincronizações]

### Alertas
- [descadastros, erros de sync, carrinhos sem recuperar, funil travado, etc.]
```
