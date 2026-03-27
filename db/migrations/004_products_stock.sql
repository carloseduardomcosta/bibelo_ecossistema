-- ══════════════════════════════════════════════════════════════
-- BibelôCRM — Migration 004 — Products & Stock (ERP Module)
-- ══════════════════════════════════════════════════════════════

-- ── Produtos sincronizados do Bling ───────────────────────────
CREATE TABLE sync.bling_products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bling_id        VARCHAR(50) UNIQUE NOT NULL,
  nome            VARCHAR(500) NOT NULL,
  sku             VARCHAR(100),
  preco_custo     NUMERIC(12,2) DEFAULT 0,
  preco_venda     NUMERIC(12,2) DEFAULT 0,
  categoria       VARCHAR(255),
  imagens         JSONB DEFAULT '[]',
  ativo           BOOLEAN DEFAULT true,
  tipo            VARCHAR(50),
  unidade         VARCHAR(20),
  peso_bruto      NUMERIC(10,3),
  gtin            VARCHAR(50),
  dados_raw       JSONB DEFAULT '{}',
  sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bling_products_sku   ON sync.bling_products(sku);
CREATE INDEX idx_bling_products_nome  ON sync.bling_products USING GIN (nome gin_trgm_ops);
CREATE INDEX idx_bling_products_ativo ON sync.bling_products(ativo);
CREATE INDEX idx_bling_products_cat   ON sync.bling_products(categoria);

-- ── Estoque por depósito ──────────────────────────────────────
CREATE TABLE sync.bling_stock (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id       UUID NOT NULL REFERENCES sync.bling_products(id) ON DELETE CASCADE,
  bling_product_id VARCHAR(50) NOT NULL,
  deposito_id      VARCHAR(50),
  deposito_nome    VARCHAR(255),
  saldo_fisico     NUMERIC(12,2) DEFAULT 0,
  saldo_virtual    NUMERIC(12,2) DEFAULT 0,
  sincronizado_em  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bling_product_id, deposito_id)
);

CREATE INDEX idx_bling_stock_product ON sync.bling_stock(product_id);

-- ── Trigger atualizado_em ─────────────────────────────────────
CREATE TRIGGER trg_bling_products_updated
  BEFORE UPDATE ON sync.bling_products
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ── Seed sync_state para produtos ─────────────────────────────
INSERT INTO sync.sync_state (fonte, total_sincronizados)
VALUES ('bling_products', 0)
ON CONFLICT (fonte) DO NOTHING;
