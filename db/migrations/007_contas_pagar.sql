-- ══════════════════════════════════════════════════════════════
-- BibelôCRM — Migration 007 — Contas a Pagar (sync Bling)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE sync.bling_contas_pagar (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bling_id          VARCHAR(50) UNIQUE NOT NULL,
  situacao          INTEGER DEFAULT 1,       -- 1=pendente, 2=pago, 3=parcial, 5=cancelado
  vencimento        DATE,
  valor             NUMERIC(12,2) DEFAULT 0,
  saldo             NUMERIC(12,2) DEFAULT 0,
  data_emissao      DATE,
  numero_documento  VARCHAR(100),
  historico         TEXT,
  contato_bling_id  VARCHAR(50),
  contato_nome      VARCHAR(255),
  contato_doc       VARCHAR(20),
  forma_pagamento   VARCHAR(255),
  data_pagamento    DATE,                    -- vem do borderô
  valor_pago        NUMERIC(12,2) DEFAULT 0,
  dados_raw         JSONB DEFAULT '{}',
  sincronizado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contas_pagar_situacao ON sync.bling_contas_pagar(situacao);
CREATE INDEX idx_contas_pagar_vencimento ON sync.bling_contas_pagar(vencimento);
CREATE INDEX idx_contas_pagar_contato ON sync.bling_contas_pagar(contato_nome);
