-- Migration 055: crm.notificacoes_operador
-- Alertas para o operador enviarem WhatsApp manualmente com contexto real.
-- Cada linha tem link wa.me pronto com mensagem pré-preenchida.

CREATE TABLE IF NOT EXISTS crm.notificacoes_operador (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        VARCHAR(50)  NOT NULL,
  -- 'carrinho_abandonado_alto_valor' | 'cliente_high_intent'
  -- | 'cliente_vip_inativo' | 'novo_membro_grupo_vip' | 'whatsapp_step'
  customer_id UUID         REFERENCES crm.customers(id) ON DELETE SET NULL,
  titulo      VARCHAR(300) NOT NULL,
  descricao   TEXT,
  dados       JSONB,        -- contexto específico (valor, produtos, template, gatilho…)
  whatsapp    VARCHAR(30),  -- número normalizado: 55DDDXXXXXXXX
  link_direto TEXT,         -- wa.me URL com mensagem pré-preenchida
  status      VARCHAR(20)  NOT NULL DEFAULT 'pendente',
  -- 'pendente' | 'enviado' | 'ignorado'
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_op_status   ON crm.notificacoes_operador (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_op_customer ON crm.notificacoes_operador (customer_id);
CREATE INDEX IF NOT EXISTS idx_notif_op_tipo     ON crm.notificacoes_operador (tipo, status);

-- Dedup: impede criar nova notificação pendente do mesmo tipo para o mesmo cliente.
-- Quando o operador marca 'enviado' ou 'ignorado', o índice parcial libera nova notificação.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_op_pendente
  ON crm.notificacoes_operador (tipo, customer_id)
  WHERE status = 'pendente';
