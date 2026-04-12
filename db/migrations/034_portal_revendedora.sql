-- Portal B2B para revendedoras
-- Índice para lookup rápido por token (toda requisição pública faz WHERE portal_token = $1)
CREATE INDEX IF NOT EXISTS idx_revendedoras_portal_token
  ON crm.revendedoras (portal_token)
  WHERE portal_token IS NOT NULL;
