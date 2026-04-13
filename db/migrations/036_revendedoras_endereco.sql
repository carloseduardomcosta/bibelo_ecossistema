-- Migration 036: Adiciona campos de endereço em crm.revendedoras
-- Data: 13/04/2026

ALTER TABLE crm.revendedoras
  ADD COLUMN IF NOT EXISTS cep          VARCHAR(8),
  ADD COLUMN IF NOT EXISTS logradouro   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS numero       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS complemento  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bairro       VARCHAR(100);

COMMENT ON COLUMN crm.revendedoras.cep         IS 'CEP sem formatação (8 dígitos)';
COMMENT ON COLUMN crm.revendedoras.logradouro  IS 'Rua, Avenida etc.';
COMMENT ON COLUMN crm.revendedoras.numero      IS 'Número do imóvel';
COMMENT ON COLUMN crm.revendedoras.complemento IS 'Apto, sala, bloco (opcional)';
COMMENT ON COLUMN crm.revendedoras.bairro      IS 'Bairro';
