-- Migration 052: Assinaturas de módulos — ativa módulos, planos mensal/anual, pagamentos MP, vendas parceira
-- Data: 2026-04-21

-- Ativar módulos com preços
UPDATE crm.modulos SET ativo = true, preco_mensal = 7.90
WHERE id IN ('fluxo_caixa', 'relatorio_vendas');

-- Ampliar crm.revendedora_modulos com controle de assinatura
ALTER TABLE crm.revendedora_modulos
  ADD COLUMN IF NOT EXISTS status              VARCHAR(20) NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS ultimo_pagamento_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proximo_vencimento_em TIMESTAMPTZ;

-- Histórico de cobranças (PIX + Checkout Pro)
CREATE TABLE IF NOT EXISTS crm.modulo_pagamentos (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  revendedora_id     UUID         NOT NULL REFERENCES crm.revendedoras(id) ON DELETE CASCADE,
  modulo_id          VARCHAR(50)  NOT NULL REFERENCES crm.modulos(id),
  plano              VARCHAR(10)  NOT NULL CHECK (plano IN ('mensal', 'anual')),
  valor              NUMERIC(8,2) NOT NULL,
  external_reference VARCHAR(200) UNIQUE,
  mp_payment_id      VARCHAR(100),
  mp_order_id        VARCHAR(100),
  status             VARCHAR(20)  NOT NULL DEFAULT 'pendente',
    -- pendente | aprovado | rejeitado | cancelado
  metodo_pagamento   VARCHAR(20),          -- pix | cartao
  qr_code            TEXT,
  qr_code_base64     TEXT,
  ticket_url         TEXT,
  expira_pix_em      TIMESTAMPTZ,
  periodo_inicio     DATE,
  periodo_fim        DATE,
  criado_em          TIMESTAMPTZ  DEFAULT NOW(),
  atualizado_em      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mod_pag_rev    ON crm.modulo_pagamentos(revendedora_id);
CREATE INDEX IF NOT EXISTS idx_mod_pag_status ON crm.modulo_pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_mod_pag_mp_id  ON crm.modulo_pagamentos(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

-- Vendas registradas pela própria revendedora (para Fluxo de Caixa)
CREATE TABLE IF NOT EXISTS crm.revendedora_vendas (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  revendedora_id UUID          NOT NULL REFERENCES crm.revendedoras(id) ON DELETE CASCADE,
  descricao      VARCHAR(300)  NOT NULL,
  valor          NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  data_venda     DATE          NOT NULL DEFAULT CURRENT_DATE,
  categoria      VARCHAR(100),
  criado_em      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rev_vendas_rev  ON crm.revendedora_vendas(revendedora_id);
CREATE INDEX IF NOT EXISTS idx_rev_vendas_data ON crm.revendedora_vendas(revendedora_id, data_venda);
