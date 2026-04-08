-- Migration 027: Staging table para categorias Bling
-- Permite que o sync Medusa leia categorias sem chamar API Bling

CREATE TABLE IF NOT EXISTS sync.bling_categories (
  bling_id        TEXT PRIMARY KEY,
  descricao       TEXT NOT NULL,
  id_pai          TEXT,           -- categoria pai (hierarquia)
  sincronizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bling_categories_pai ON sync.bling_categories (id_pai);

-- Tabela de controle do sync Medusa (monitoramento)
CREATE TABLE IF NOT EXISTS sync.medusa_sync_log (
  id              SERIAL PRIMARY KEY,
  tipo            TEXT NOT NULL,        -- 'products', 'inventory', 'categories', 'dry-run'
  status          TEXT NOT NULL,        -- 'ok', 'erro', 'paused', 'dry-run'
  produtos_total  INT DEFAULT 0,
  produtos_criados INT DEFAULT 0,
  produtos_atualizados INT DEFAULT 0,
  estoque_atualizado INT DEFAULT 0,
  erros           INT DEFAULT 0,
  duracao_ms      INT DEFAULT 0,
  detalhes        JSONB,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- Flag de controle (kill switch)
INSERT INTO sync.sync_state (fonte, ultimo_id, ultima_sync, total_sincronizados)
VALUES ('medusa-sync', '{"enabled":false,"mode":"dry-run","max_products":100}', NOW(), 0)
ON CONFLICT (fonte) DO NOTHING;
