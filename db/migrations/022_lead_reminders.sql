-- Migration 022: Adiciona controle de lembretes de verificação para leads
-- Permite reenvio automático do email de confirmação

ALTER TABLE marketing.leads
  ADD COLUMN IF NOT EXISTS lembretes_enviados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_lembrete_em TIMESTAMPTZ;
