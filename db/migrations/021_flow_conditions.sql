-- 021_flow_conditions.sql — Suporte a condicionais no motor de fluxos

-- Índice para buscar messageId dentro do JSONB resultado (lookup rápido no webhook)
CREATE INDEX IF NOT EXISTS idx_flow_step_exec_messageid
  ON marketing.flow_step_executions ((resultado->>'messageId'))
  WHERE resultado->>'messageId' IS NOT NULL;

-- Índice composto para busca eficiente de eventos por message_id + tipo
CREATE INDEX IF NOT EXISTS idx_email_events_message_tipo
  ON marketing.email_events(message_id, tipo)
  WHERE message_id IS NOT NULL;
