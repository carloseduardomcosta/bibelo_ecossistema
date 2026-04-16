-- Migration 045: campos fiscais/comerciais na tabela crm.customers
-- ie = inscrição estadual (PJ), fantasia = nome fantasia

ALTER TABLE crm.customers
  ADD COLUMN IF NOT EXISTS fantasia VARCHAR(255),
  ADD COLUMN IF NOT EXISTS ie       VARCHAR(50);
