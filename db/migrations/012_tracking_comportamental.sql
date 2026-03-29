-- 012_tracking_comportamental.sql — Tracking de comportamento no site NuvemShop
-- Substitui tracking do Edrone por sistema próprio do BibelôCRM

-- ── Eventos de navegação ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.tracking_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visitor_id      VARCHAR(100) NOT NULL,           -- cookie _bibelo_vid
  customer_id     UUID REFERENCES crm.customers(id) ON DELETE SET NULL,
  evento          VARCHAR(50) NOT NULL,             -- page_view, product_view, category_view, add_to_cart, search
  pagina          TEXT,                             -- URL completa
  pagina_tipo     VARCHAR(30),                     -- home, product, category, cart, checkout, search, other
  resource_id     VARCHAR(100),                    -- ID do produto/categoria na NuvemShop
  resource_nome   VARCHAR(300),                    -- Nome do produto/categoria
  resource_preco  NUMERIC(12,2),                   -- Preço (se produto)
  resource_imagem TEXT,                            -- URL da imagem (se produto)
  referrer        TEXT,                            -- De onde veio
  metadata        JSONB DEFAULT '{}',              -- Dados extras (search query, variante, etc.)
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX idx_track_visitor ON crm.tracking_events(visitor_id, criado_em DESC);
CREATE INDEX idx_track_customer ON crm.tracking_events(customer_id, criado_em DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_track_evento ON crm.tracking_events(evento, criado_em DESC);
CREATE INDEX idx_track_resource ON crm.tracking_events(resource_id) WHERE resource_id IS NOT NULL;
CREATE INDEX idx_track_criado ON crm.tracking_events(criado_em DESC);

-- Limpeza de eventos antigos: usar query DELETE WHERE criado_em < NOW() - INTERVAL '90 days'

-- ── Vincular visitor_id ao customer_id ────────────────────────
-- Quando visitante anônimo faz checkout ou login, vincula retroativamente
CREATE TABLE IF NOT EXISTS crm.visitor_customers (
  visitor_id      VARCHAR(100) PRIMARY KEY,
  customer_id     UUID NOT NULL REFERENCES crm.customers(id) ON DELETE CASCADE,
  vinculado_em    TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 012_tracking_comportamental aplicada em 2026-03-29
