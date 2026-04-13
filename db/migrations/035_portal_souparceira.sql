-- Portal "Sou Parceira" — autenticação OTP por CPF + email
-- Tabela de códigos de acesso temporários

CREATE TABLE IF NOT EXISTS crm.portal_parceira_otp (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revendedora_id   uuid NOT NULL REFERENCES crm.revendedoras(id) ON DELETE CASCADE,
  codigo           varchar(8)  NOT NULL,
  expira_em        timestamptz NOT NULL,
  usado_em         timestamptz,          -- NULL = ainda válido
  ip_solicitacao   varchar(45),
  criado_em        timestamptz NOT NULL DEFAULT NOW()
);

-- Lookup por revendedora (rate limit)
CREATE INDEX IF NOT EXISTS idx_parceira_otp_rev
  ON crm.portal_parceira_otp (revendedora_id, criado_em DESC);

-- Lookup por código (validação de acesso)
CREATE INDEX IF NOT EXISTS idx_parceira_otp_codigo
  ON crm.portal_parceira_otp (codigo)
  WHERE usado_em IS NULL;
