-- Tabela para registro detalhado de eventos de email (cada open, click, bounce individualmente)
CREATE TABLE IF NOT EXISTS marketing.email_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_send_id UUID REFERENCES marketing.campaign_sends(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES marketing.campaigns(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES crm.customers(id) ON DELETE CASCADE,
  message_id VARCHAR(255),
  tipo VARCHAR(20) NOT NULL,  -- opened, clicked, bounced, complained, delivered
  link TEXT,                   -- URL clicada (só para clicked)
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON marketing.email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_customer ON marketing.email_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_events_message ON marketing.email_events(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_events_criado ON marketing.email_events(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_tipo ON marketing.email_events(tipo);
