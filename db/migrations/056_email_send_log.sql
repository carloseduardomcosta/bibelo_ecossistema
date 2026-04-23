-- Migration 056: email_send_log
-- Registra bloqueios de envio de email antes de disparar o template.
-- Permite auditar por que um step foi pulado (email inválido, opt-out, contexto faltando, etc.)

CREATE TABLE IF NOT EXISTS marketing.email_send_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES crm.customers(id) ON DELETE SET NULL,
  tipo        VARCHAR(80)  NOT NULL,   -- nome do template / step
  acao        VARCHAR(20)  NOT NULL DEFAULT 'bloqueado', -- bloqueado | enviado
  motivo      TEXT,                   -- motivo do bloqueio (quando acao = 'bloqueado')
  dados       JSONB,                  -- snapshot do metadata relevante
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_send_log_customer ON marketing.email_send_log (customer_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_tipo    ON marketing.email_send_log (tipo);
CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON marketing.email_send_log (created_at DESC);
