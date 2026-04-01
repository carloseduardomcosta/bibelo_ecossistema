-- Migration 017: Indexes de performance
-- Corrige queries lentas identificadas na auditoria de 01/04/2026

-- ── Pedidos: JOIN e ORDER BY frequentes ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_bling_orders_customer_id ON sync.bling_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_bling_orders_criado_bling_desc ON sync.bling_orders(criado_bling DESC);

-- ── Flow executions: contagem por status (N+1 na listagem de fluxos) ──
CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_status ON marketing.flow_executions(flow_id, status);
CREATE INDEX IF NOT EXISTS idx_flow_executions_status_concluido ON marketing.flow_executions(status, concluido_em DESC)
  WHERE status IN ('concluido', 'erro');

-- ── Campaign sends: contagem pendentes por campanha ──────────────
CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign_status ON marketing.campaign_sends(campaign_id, status);

-- ── Leads: lookup por email (já tem UNIQUE, mas partial para não-nulos) ──
CREATE INDEX IF NOT EXISTS idx_leads_email_lower ON marketing.leads(LOWER(email));

-- ── Tracking events: busca por visitor_id e data ─────────────────
CREATE INDEX IF NOT EXISTS idx_tracking_events_visitor ON crm.tracking_events(visitor_id, criado_em DESC);

-- ── Pedidos pendentes: filtros do dashboard de fluxos ────────────
CREATE INDEX IF NOT EXISTS idx_pedidos_pendentes_status ON marketing.pedidos_pendentes(convertido, notificado);

-- ── Interactions: timeline do cliente ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_interactions_customer_date ON crm.interactions(customer_id, criado_em DESC);

-- ── NuvemShop orders: ns_id já tem UNIQUE constraint (ok) ────────
