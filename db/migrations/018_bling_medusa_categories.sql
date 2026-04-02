-- Migração 018: Tabela de mapeamento Bling → Medusa para categorias
-- e coluna bling_category_id em bling_products

-- Tabela de mapeamento
CREATE TABLE IF NOT EXISTS sync.bling_medusa_categories (
  bling_category_id VARCHAR(50) PRIMARY KEY,
  medusa_category_id VARCHAR(100) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  handle VARCHAR(255),
  bling_parent_id VARCHAR(50),
  sincronizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Coluna para guardar o ID da categoria Bling no produto
ALTER TABLE sync.bling_products
  ADD COLUMN IF NOT EXISTS bling_category_id VARCHAR(50);

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_bling_products_category_id
  ON sync.bling_products(bling_category_id);
