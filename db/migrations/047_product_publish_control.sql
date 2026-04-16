-- Migration 047: Controle de publicação de produtos Bling → Medusa

-- 1. Tabela de controle: cada SKU tem um status de curadoria
CREATE TABLE IF NOT EXISTS sync.product_publish_control (
  sku               TEXT PRIMARY KEY,
  bling_id          BIGINT,
  medusa_id         TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
    -- 'pending'  = aguardando revisão → Medusa draft
    -- 'approved' = aprovado manualmente → Medusa published
    -- 'rejected' = rejeitado → não sincroniza (Medusa draft)
    -- 'auto'     = aprovado automaticamente por categoria → Medusa published
  missing_image     BOOLEAN NOT NULL DEFAULT false,
  missing_price     BOOLEAN NOT NULL DEFAULT false,
  unmapped_category BOOLEAN NOT NULL DEFAULT false,
  nome_original     TEXT,
  categoria_bling   TEXT,
  motivo            TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppc_status   ON sync.product_publish_control (status);
CREATE INDEX IF NOT EXISTS idx_ppc_bling_id ON sync.product_publish_control (bling_id);

-- 2. Auto-aprovação por categoria (padrão false — curadoria manual)
ALTER TABLE sync.bling_medusa_categories
  ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN NOT NULL DEFAULT false;

-- 3. Colunas de detalhe no log de sync Medusa
ALTER TABLE sync.medusa_sync_log
  ADD COLUMN IF NOT EXISTS publish_status TEXT,
  ADD COLUMN IF NOT EXISTS motivo TEXT;
