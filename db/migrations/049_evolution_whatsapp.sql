-- Migration 049 — Evolution API: whatsapp_jid em customers

ALTER TABLE crm.customers
  ADD COLUMN IF NOT EXISTS whatsapp_jid VARCHAR(100) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_customers_whatsapp_jid
  ON crm.customers(whatsapp_jid)
  WHERE whatsapp_jid IS NOT NULL;
