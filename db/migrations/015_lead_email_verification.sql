-- Migration 015: Verificação de email para leads (anti-fake)
-- Cupom só é entregue após clicar no link de confirmação

ALTER TABLE marketing.leads
  ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verificado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_verificado ON marketing.leads (email_verificado) WHERE email_verificado = false;

-- Leads existentes já receberam cupom pelo fluxo antigo — marca como verificados
UPDATE marketing.leads SET email_verificado = true, email_verificado_em = criado_em WHERE email_verificado = false;

COMMENT ON COLUMN marketing.leads.email_verificado IS 'Email confirmado via link de verificação';
COMMENT ON COLUMN marketing.leads.email_verificado_em IS 'Data/hora da confirmação do email';
