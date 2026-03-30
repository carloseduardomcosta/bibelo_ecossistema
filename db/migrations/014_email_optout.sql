-- Migration 014: Opt-out de emails (LGPD)
-- Respeita o direito do cliente de não receber mais emails

ALTER TABLE crm.customers
  ADD COLUMN IF NOT EXISTS email_optout BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_optout_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_optout ON crm.customers (email_optout) WHERE email_optout = true;

COMMENT ON COLUMN crm.customers.email_optout IS 'Cliente solicitou descadastro de emails (LGPD)';
COMMENT ON COLUMN crm.customers.email_optout_em IS 'Data/hora do descadastro';
