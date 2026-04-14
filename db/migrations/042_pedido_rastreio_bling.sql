-- Migration 042: rastreio de envio + integração Bling nos pedidos B2B
-- Adiciona campos de rastreio e ID do pedido no Bling

ALTER TABLE crm.revendedora_pedidos
  ADD COLUMN IF NOT EXISTS codigo_rastreio VARCHAR(100),
  ADD COLUMN IF NOT EXISTS url_rastreio    TEXT,
  ADD COLUMN IF NOT EXISTS bling_pedido_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_rev_pedidos_bling_id
  ON crm.revendedora_pedidos(bling_pedido_id)
  WHERE bling_pedido_id IS NOT NULL;

COMMENT ON COLUMN crm.revendedora_pedidos.codigo_rastreio IS 'Código de rastreio dos Correios / Melhor Envio';
COMMENT ON COLUMN crm.revendedora_pedidos.url_rastreio    IS 'URL de rastreio no Melhor Rastreio';
COMMENT ON COLUMN crm.revendedora_pedidos.bling_pedido_id IS 'ID do pedido de venda no Bling (gerado ao aprovar)';
