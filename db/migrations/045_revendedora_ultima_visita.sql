-- 044_revendedora_ultima_visita.sql
-- Registra quando a revendedora visitou o catálogo pela última vez
-- Usado para calcular quantos produtos novos ela ainda não viu

ALTER TABLE crm.revendedoras
  ADD COLUMN IF NOT EXISTS catalogo_visitado_em TIMESTAMPTZ;

COMMENT ON COLUMN crm.revendedoras.catalogo_visitado_em
  IS 'Última vez que a revendedora abriu a aba Catálogo no portal';
