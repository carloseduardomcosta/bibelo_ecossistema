-- ══════════════════════════════════════════════════════════════
-- BibelôCRM — Migration 006 — Formas de Pagamento + NF-e emitidas
-- ══════════════════════════════════════════════════════════════

-- ── Formas de pagamento do Bling ──────────────────────────────
CREATE TABLE sync.bling_formas_pagamento (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bling_id        VARCHAR(50) UNIQUE NOT NULL,
  descricao       VARCHAR(255) NOT NULL,
  tipo_pagamento  INTEGER,
  situacao        INTEGER DEFAULT 1,
  sincronizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ── Parcelas dos pedidos (forma de pagamento por venda) ───────
CREATE TABLE sync.bling_order_parcelas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_bling_id  VARCHAR(50) NOT NULL,
  parcela_bling_id VARCHAR(50),
  data_vencimento DATE,
  valor           NUMERIC(12,2) NOT NULL DEFAULT 0,
  forma_pagamento_id VARCHAR(50),
  forma_descricao VARCHAR(255),
  sincronizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_parcelas_order ON sync.bling_order_parcelas(order_bling_id);
CREATE INDEX idx_order_parcelas_forma ON sync.bling_order_parcelas(forma_pagamento_id);

-- ── NF-e emitidas (sync do Bling) ────────────────────────────
CREATE TABLE sync.bling_nfe (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bling_id        VARCHAR(50) UNIQUE NOT NULL,
  tipo            INTEGER DEFAULT 1,
  situacao        INTEGER,
  numero          VARCHAR(20),
  data_emissao    TIMESTAMPTZ,
  chave_acesso    VARCHAR(50),
  valor_total     NUMERIC(12,2) DEFAULT 0,
  contato_nome    VARCHAR(255),
  contato_doc     VARCHAR(20),
  natureza_op     VARCHAR(255),
  dados_raw       JSONB DEFAULT '{}',
  sincronizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bling_nfe_numero ON sync.bling_nfe(numero);
CREATE INDEX idx_bling_nfe_data ON sync.bling_nfe(data_emissao);
CREATE INDEX idx_bling_nfe_situacao ON sync.bling_nfe(situacao);
