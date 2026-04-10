-- Migration 029: Painel de Sincronização de Categorias
-- Evolui sync.bling_medusa_categories para suporte ao painel de gestão manual no CRM
-- e adiciona log de operações com timestamp e origem

-- 1. Permitir medusa_category_id nulo (categorias 'pending' ainda não têm ID no Medusa)
ALTER TABLE sync.bling_medusa_categories
  ALTER COLUMN medusa_category_id DROP NOT NULL;

-- 2. Nome original do Bling (sem formatação Title Case — exibido tal qual na UI)
ALTER TABLE sync.bling_medusa_categories
  ADD COLUMN IF NOT EXISTS bling_category_name VARCHAR(255);

-- 3. Status do mapeamento (controle pelo painel)
ALTER TABLE sync.bling_medusa_categories
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('mapped', 'pending', 'ignored'));

-- 4. Timestamp de criação (sincronizado_em já existe e serve como updated_at)
ALTER TABLE sync.bling_medusa_categories
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 5. Origem da última operação (rastreabilidade)
--    valores: 'manual' | 'webhook' | 'incremental' | 'full' | 'migration'
ALTER TABLE sync.bling_medusa_categories
  ADD COLUMN IF NOT EXISTS origem VARCHAR(50);

-- 6. Marcar registros existentes como mapeados (já tinham medusa_category_id preenchido)
--    NOTA: executa APÓS todos os ALTER TABLE acima — ordem garantida pelo SQL sequencial
UPDATE sync.bling_medusa_categories
  SET status              = 'mapped',
      bling_category_name = nome,
      origem              = 'migration',
      created_at          = COALESCE(sincronizado_em, NOW())
WHERE medusa_category_id IS NOT NULL;

-- 7. Índice para queries por status (filtro e contagem no painel)
CREATE INDEX IF NOT EXISTS idx_bmc_status
  ON sync.bling_medusa_categories(status);

-- 8. Log de todas as operações do painel de categorias
--    operacao: 'importar' | 'mapear' | 'ignorar' | 'sincronizar'
--    origem:   'manual' | 'webhook' | 'full' | 'incremental'
CREATE TABLE IF NOT EXISTS sync.category_sync_log (
  id         SERIAL        PRIMARY KEY,
  operacao   VARCHAR(50)   NOT NULL,
  origem     VARCHAR(50)   NOT NULL,
  usuario    VARCHAR(255),
  detalhes   JSONB,
  criado_em  TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cat_sync_log_em
  ON sync.category_sync_log(criado_em DESC);
