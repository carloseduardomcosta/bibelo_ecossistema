-- Migration 053 — VIP Grupo WhatsApp: cache de membros verificados via WAHA

ALTER TABLE crm.customers
  ADD COLUMN IF NOT EXISTS vip_grupo_wp         BOOLEAN,
  ADD COLUMN IF NOT EXISTS vip_grupo_wp_em      TIMESTAMPTZ;

ALTER TABLE marketing.leads
  ADD COLUMN IF NOT EXISTS vip_grupo_wp         BOOLEAN,
  ADD COLUMN IF NOT EXISTS vip_grupo_wp_em      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_vip_grupo_wp
  ON crm.customers(vip_grupo_wp)
  WHERE vip_grupo_wp = true;
