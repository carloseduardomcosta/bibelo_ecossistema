-- Migration 054: crm.order_items
-- Desnormaliza itens de pedidos (Bling + NuvemShop) para consultas eficientes
-- sem jsonb_array_elements em runtime.

CREATE TABLE IF NOT EXISTS crm.order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source         VARCHAR(20)   NOT NULL,                               -- 'bling' | 'nuvemshop'
  order_id       VARCHAR(50)   NOT NULL,                               -- bling_id ou ns_id
  customer_id    UUID          REFERENCES crm.customers(id) ON DELETE SET NULL,
  sku            VARCHAR(200),                                          -- codigo Bling; NULL em NuvemShop sem SKU
  nome           VARCHAR(500)  NOT NULL,
  posicao        INT           NOT NULL DEFAULT 0,                     -- índice 0-based no array original
  quantidade     INT           NOT NULL DEFAULT 1,
  valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_total    NUMERIC(10,2) NOT NULL DEFAULT 0,                     -- quantidade × valor_unitario
  image_url      TEXT,                                                  -- preenchido por NuvemShop
  ns_product_id  VARCHAR(50),                                          -- product_id NuvemShop
  criado_em      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),                 -- data do pedido

  UNIQUE (source, order_id, posicao)                                   -- idempotência: reprocessar webhook não duplica
);

CREATE INDEX IF NOT EXISTS idx_order_items_customer  ON crm.order_items (customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku       ON crm.order_items (sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_source    ON crm.order_items (source, order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_criado_em ON crm.order_items (criado_em);

-- ── Backfill Bling ───────────────────────────────────────────────────────────
INSERT INTO crm.order_items (
  source, order_id, customer_id, sku, nome, posicao,
  quantidade, valor_unitario, valor_total, criado_em
)
SELECT
  'bling',
  sub.bling_id,
  sub.customer_id,
  sub.sku,
  sub.nome,
  (ROW_NUMBER() OVER (PARTITION BY sub.bling_id ORDER BY sub.pos) - 1)::int AS posicao,
  sub.quantidade,
  sub.valor_unitario,
  sub.quantidade * sub.valor_unitario AS valor_total,
  sub.criado_em
FROM (
  SELECT
    o.bling_id,
    o.customer_id,
    item->>'codigo'                                   AS sku,
    COALESCE(item->>'descricao', 'Produto')           AS nome,
    pos,
    COALESCE((item->>'quantidade')::int, 1)           AS quantidade,
    COALESCE((item->>'valor')::numeric, 0)            AS valor_unitario,
    COALESCE(o.criado_bling, NOW())                   AS criado_em
  FROM sync.bling_orders o,
    jsonb_array_elements(o.itens) WITH ORDINALITY AS item_row(item, pos)
  WHERE o.itens IS NOT NULL
    AND jsonb_typeof(o.itens) = 'array'
) sub
ON CONFLICT (source, order_id, posicao) DO NOTHING;

-- ── Backfill NuvemShop ────────────────────────────────────────────────────────
-- Formato: {name, quantity, price, image_url, product_id}
INSERT INTO crm.order_items (
  source, order_id, customer_id, nome, posicao,
  quantidade, valor_unitario, valor_total, image_url, ns_product_id, criado_em
)
SELECT
  'nuvemshop',
  sub.ns_id,
  sub.customer_id,
  sub.nome,
  (ROW_NUMBER() OVER (PARTITION BY sub.ns_id ORDER BY sub.pos) - 1)::int AS posicao,
  sub.quantidade,
  sub.valor_unitario,
  sub.quantidade * sub.valor_unitario AS valor_total,
  sub.image_url,
  sub.ns_product_id,
  sub.criado_em
FROM (
  SELECT
    o.ns_id,
    o.customer_id,
    COALESCE(item->>'name', 'Produto')                   AS nome,
    pos,
    COALESCE((item->>'quantity')::int, 1)                AS quantidade,
    COALESCE((item->>'price')::numeric, 0)               AS valor_unitario,
    item->>'image_url'                                   AS image_url,
    item->>'product_id'                                  AS ns_product_id,
    COALESCE(o.webhook_em, NOW())                        AS criado_em
  FROM sync.nuvemshop_orders o,
    jsonb_array_elements(o.itens) WITH ORDINALITY AS item_row(item, pos)
  WHERE o.itens IS NOT NULL
    AND jsonb_typeof(o.itens) = 'array'
) sub
ON CONFLICT (source, order_id, posicao) DO NOTHING;
