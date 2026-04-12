-- 033_fornecedor_catalogo.sql
-- Catálogo do fornecedor JC Atacado — scraper + curadoria de markup

-- Markup configurável por categoria do fornecedor
CREATE TABLE IF NOT EXISTS sync.fornecedor_markup_categorias (
  categoria     VARCHAR(200) PRIMARY KEY,
  markup        NUMERIC(4,2) NOT NULL DEFAULT 2.00
                CHECK (markup BETWEEN 1.0 AND 5.0),
  atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Catálogo de produtos importados do JC Atacado
CREATE TABLE IF NOT EXISTS sync.fornecedor_catalogo_jc (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id          VARCHAR(50)  NOT NULL UNIQUE,       -- ID interno do fornecedor
  nome             VARCHAR(500) NOT NULL,
  categoria        VARCHAR(200),                       -- ex: "Caneta Esferográfica"
  slug_categoria   VARCHAR(200),                       -- ex: "caneta-esferografica"
  preco_custo      NUMERIC(10,2) NOT NULL,             -- preço do atacado (sem markup)
  imagem_url       TEXT,
  status           VARCHAR(20)  NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho', 'aprovado', 'pausado')),
  markup_override  NUMERIC(4,2),                       -- override individual (null = usa categoria)
  criado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fcat_status       ON sync.fornecedor_catalogo_jc (status);
CREATE INDEX IF NOT EXISTS idx_fcat_categoria    ON sync.fornecedor_catalogo_jc (categoria);
CREATE INDEX IF NOT EXISTS idx_fcat_slug         ON sync.fornecedor_catalogo_jc (slug_categoria);
CREATE INDEX IF NOT EXISTS idx_fcat_nome         ON sync.fornecedor_catalogo_jc USING gin (nome gin_trgm_ops);

-- Log de execuções do scraper
CREATE TABLE IF NOT EXISTS sync.fornecedor_sync_log (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  iniciado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em            TIMESTAMPTZ,
  status                  VARCHAR(20) NOT NULL DEFAULT 'em_andamento'
                          CHECK (status IN ('em_andamento', 'concluido', 'erro', 'interrompido')),
  produtos_salvos         INTEGER     NOT NULL DEFAULT 0,
  produtos_atualizados    INTEGER     NOT NULL DEFAULT 0,
  categorias_processadas  INTEGER     NOT NULL DEFAULT 0,
  total_categorias        INTEGER     NOT NULL DEFAULT 0,
  erros                   INTEGER     NOT NULL DEFAULT 0,
  log                     TEXT
);
