-- Index para lookup de message_id nos webhooks do Resend (open/click/bounce)
CREATE INDEX IF NOT EXISTS idx_campaign_sends_message_id ON marketing.campaign_sends(message_id) WHERE message_id IS NOT NULL;

-- Index para lookup de message_id nos step executions dos fluxos
CREATE INDEX IF NOT EXISTS idx_step_exec_resultado_message ON marketing.flow_step_executions USING gin(resultado) WHERE tipo = 'email';
