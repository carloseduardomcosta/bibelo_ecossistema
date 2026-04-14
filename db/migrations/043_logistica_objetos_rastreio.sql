-- Migration 043: objetos logísticos para rastreio de envios
-- Armazena dados de rastreio vindos da API Bling (logisticas/objetos)
-- Vinculado a sync.bling_orders via bling_pedido_id

CREATE TABLE IF NOT EXISTS sync.logistica_objetos (
  id                 uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  bling_objeto_id    bigint      UNIQUE NOT NULL,
  bling_remessa_id   bigint,
  bling_pedido_id    bigint,                         -- bling_orders.bling_id
  tracking_code      varchar(50) NOT NULL,
  url_rastreio       text,
  servico_nome       varchar(100),
  status_descricao   varchar(500),
  situacao           int         NOT NULL DEFAULT 0, -- 0=postado,1=em trânsito,2=entregue,etc
  origem             varchar(200),
  destino            varchar(200),
  ultima_alteracao   timestamptz,
  data_saida         date,
  prazo_entrega_dias int,
  frete_previsto     numeric(10,2),
  valor_declarado    numeric(10,2),
  sincronizado_em    timestamptz NOT NULL DEFAULT now(),
  criado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistica_objetos_tracking
  ON sync.logistica_objetos(tracking_code);

CREATE INDEX IF NOT EXISTS idx_logistica_objetos_pedido
  ON sync.logistica_objetos(bling_pedido_id)
  WHERE bling_pedido_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_logistica_objetos_sincronizado
  ON sync.logistica_objetos(sincronizado_em DESC);

COMMENT ON TABLE sync.logistica_objetos IS
  'Objetos logísticos do Bling (remessas Melhor Envio) com código de rastreio e status';
COMMENT ON COLUMN sync.logistica_objetos.bling_objeto_id IS
  'ID do objeto logístico na API Bling (GET /logisticas/objetos/{id})';
COMMENT ON COLUMN sync.logistica_objetos.bling_pedido_id IS
  'ID do pedido de venda no Bling — FK lógica para sync.bling_orders.bling_id';
COMMENT ON COLUMN sync.logistica_objetos.situacao IS
  '0=postado, 1=em trânsito, 2=entregue, 3=tentativa, 4=devolvido, 5=outros';
