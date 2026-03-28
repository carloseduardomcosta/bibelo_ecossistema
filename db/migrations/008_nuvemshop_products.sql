-- Migration 008: Tabela de produtos NuvemShop
-- Permite mapear produtos entre NuvemShop e Bling por SKU

CREATE TABLE IF NOT EXISTS sync.nuvemshop_products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ns_id           VARCHAR(50) UNIQUE NOT NULL,
  nome            VARCHAR(500) NOT NULL,
  sku             VARCHAR(100),
  preco           NUMERIC(12,2),
  custo           NUMERIC(12,2),
  estoque         INTEGER,
  imagens         JSONB DEFAULT '[]',
  publicado       BOOLEAN DEFAULT true,
  dados_raw       JSONB,
  sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ns_products_sku ON sync.nuvemshop_products (sku);
CREATE INDEX IF NOT EXISTS idx_ns_products_nome ON sync.nuvemshop_products USING gin (nome gin_trgm_ops);
