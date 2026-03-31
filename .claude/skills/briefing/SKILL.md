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

Execute os comandos SQL abaixo via `docker compose exec -T postgres psql -U bibelocrm bibelocrm -c "..."` para coletar dados reais.

### 1. Visitantes e Tracking (últimas 24h)
```sql
-- Total de visitantes únicos e page views
SELECT
  COUNT(DISTINCT visitor_id) as visitantes_unicos,
  COUNT(*) as total_eventos,
  COUNT(*) FILTER (WHERE event_type = 'page_view') as page_views,
  COUNT(*) FILTER (WHERE event_type = 'product_view') as produto_views,
  COUNT(*) FILTER (WHERE event_type = 'add_to_cart') as add_to_cart,
  COUNT(*) FILTER (WHERE event_type = 'checkout') as checkouts,
  COUNT(*) FILTER (WHERE event_type = 'purchase') as compras
FROM crm.tracking_events
WHERE created_at >= NOW() - INTERVAL '24 hours'
  AND visitor_id NOT IN (SELECT unnest(string_to_array(COALESCE(current_setting('app.internal_ips', true), ''), ',')));

-- Top 5 produtos mais vistos
SELECT product_name, COUNT(*) as views
FROM crm.tracking_events
WHERE event_type = 'product_view' AND created_at >= NOW() - INTERVAL '24 hours'
  AND product_name IS NOT NULL
GROUP BY product_name ORDER BY views DESC LIMIT 5;

-- Top estados (geolocalização)
SELECT state, COUNT(DISTINCT visitor_id) as visitantes
FROM crm.tracking_events
WHERE created_at >= NOW() - INTERVAL '24 hours' AND state IS NOT NULL
GROUP BY state ORDER BY visitantes DESC LIMIT 5;
```

### 2. Leads capturados
```sql
-- Novos leads nas últimas 24h
SELECT COUNT(*) as novos_leads,
  COUNT(*) FILTER (WHERE email_verificado = true) as verificados,
  COUNT(*) FILTER (WHERE convertido = true) as convertidos
FROM marketing.leads
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- Lista dos leads recentes
SELECT nome, email, fonte, cupom_usado, email_verificado, created_at
FROM marketing.leads
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC LIMIT 10;
```

### 3. Fluxos automáticos — execuções recentes
```sql
-- Execuções de fluxos nas últimas 24h
SELECT f.nome, fe.status, COUNT(*) as total
FROM marketing.flow_executions fe
JOIN marketing.flows f ON f.id = fe.flow_id
WHERE fe.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY f.nome, fe.status
ORDER BY f.nome, total DESC;

-- Steps executados (emails enviados, etc)
SELECT f.nome as fluxo, fse.step_type, fse.status, COUNT(*) as total
FROM marketing.flow_step_executions fse
JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
JOIN marketing.flows f ON f.id = fe.flow_id
WHERE fse.executed_at >= NOW() - INTERVAL '24 hours'
GROUP BY f.nome, fse.step_type, fse.status
ORDER BY total DESC;
```

### 4. Pedidos / Vendas recentes
```sql
-- Pedidos NuvemShop nas últimas 24h
SELECT COUNT(*) as total_pedidos,
  COALESCE(SUM(total), 0) as receita_total,
  ROUND(COALESCE(AVG(total), 0), 2) as ticket_medio
FROM sync.nuvemshop_orders
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- Pedidos Bling nas últimas 24h
SELECT COUNT(*) as total_pedidos,
  COALESCE(SUM(total_produtos), 0) as receita_total
FROM sync.bling_orders
WHERE data >= NOW() - INTERVAL '24 hours';
```

### 5. Carrinhos abandonados
```sql
-- Carrinhos detectados nas últimas 24h
SELECT COUNT(*) as carrinhos_abandonados,
  COUNT(*) FILTER (WHERE recovered = true) as recuperados
FROM marketing.pedidos_pendentes
WHERE created_at >= NOW() - INTERVAL '24 hours';
```

### 6. Opt-outs (descadastros)
```sql
SELECT COUNT(*) as descadastros
FROM crm.customers
WHERE email_optout = true AND updated_at >= NOW() - INTERVAL '24 hours';
```

### 7. Sync status
```sql
SELECT fonte, tipo, status, started_at, finished_at
FROM sync.sync_logs
WHERE started_at >= NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC LIMIT 10;
```

### 8. Fluxos que vão executar nas próximas horas
```sql
-- Próximas execuções agendadas (steps pendentes)
SELECT f.nome as fluxo, fe.status, fe.proximo_step_em, c.nome as cliente
FROM marketing.flow_executions fe
JOIN marketing.flows f ON f.id = fe.flow_id
LEFT JOIN crm.customers c ON c.id = fe.customer_id
WHERE fe.status = 'ativa' AND fe.proximo_step_em IS NOT NULL
  AND fe.proximo_step_em <= NOW() + INTERVAL '12 hours'
ORDER BY fe.proximo_step_em ASC
LIMIT 15;
```

## Formato de saída

Apresentar o briefing organizado assim:

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
- [descadastros, erros de sync, carrinhos sem recuperar, etc.]
```

Se alguma query retornar erro, informar qual tabela/coluna não existe e ajustar. Adaptar as queries conforme a estrutura real encontrada.
