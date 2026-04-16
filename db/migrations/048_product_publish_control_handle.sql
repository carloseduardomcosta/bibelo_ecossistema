ALTER TABLE sync.product_publish_control
  ADD COLUMN IF NOT EXISTS medusa_handle TEXT;

CREATE INDEX IF NOT EXISTS idx_ppc_medusa_handle
  ON sync.product_publish_control (medusa_handle)
  WHERE medusa_handle IS NOT NULL;
