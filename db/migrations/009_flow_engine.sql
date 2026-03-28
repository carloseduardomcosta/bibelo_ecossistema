-- 009_flow_engine.sql — Motor de fluxos automáticos
-- Adiciona rastreamento granular de steps e suporte a carrinho abandonado

-- ── Metadata na execução (contexto do gatilho: order_id, etc.)
ALTER TABLE marketing.flow_executions
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS proximo_step_em TIMESTAMPTZ;

-- ── Execução individual de cada step
CREATE TABLE IF NOT EXISTS marketing.flow_step_executions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id    UUID NOT NULL REFERENCES marketing.flow_executions(id) ON DELETE CASCADE,
  step_index      INTEGER NOT NULL,
  tipo            VARCHAR(20) NOT NULL,  -- email, whatsapp, wait, condicao
  status          VARCHAR(20) DEFAULT 'pendente',  -- pendente, executando, concluido, erro, pulado
  resultado       JSONB DEFAULT '{}',    -- { message_id, error, ... }
  agendado_para   TIMESTAMPTZ,
  executado_em    TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_step_exec_execution ON marketing.flow_step_executions(execution_id);
CREATE INDEX idx_step_exec_status ON marketing.flow_step_executions(status);
CREATE INDEX idx_step_exec_agendado ON marketing.flow_step_executions(agendado_para) WHERE status = 'pendente';

-- ── Índice para buscar execuções ativas com próximo step agendado
CREATE INDEX idx_flow_exec_proximo ON marketing.flow_executions(proximo_step_em) WHERE status = 'ativo';

-- ── Tabela de pedidos pendentes (para detectar carrinho abandonado)
-- NuvemShop: order/created sem order/paid após X horas = abandono
CREATE TABLE IF NOT EXISTS marketing.pedidos_pendentes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ns_order_id     VARCHAR(50) NOT NULL UNIQUE,
  customer_id     UUID REFERENCES crm.customers(id) ON DELETE SET NULL,
  email           VARCHAR(255),
  valor           NUMERIC(12,2),
  itens           JSONB DEFAULT '[]',
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  expira_em       TIMESTAMPTZ NOT NULL,  -- criado_em + 2h = hora de checar abandono
  convertido      BOOLEAN DEFAULT false,  -- true se order/paid chegou
  notificado      BOOLEAN DEFAULT false   -- true se já disparou fluxo de recuperação
);

CREATE INDEX idx_pedidos_pend_expira ON marketing.pedidos_pendentes(expira_em)
  WHERE convertido = false AND notificado = false;

-- ── Novos gatilhos padrão
INSERT INTO marketing.flows (nome, descricao, gatilho, gatilho_config, steps, ativo) VALUES
  (
    'Recuperação de carrinho',
    'Email automático quando pedido não é pago em 2 horas',
    'order.abandoned',
    '{"delay_horas": 2}',
    '[
      {"tipo":"email","template":"Carrinho abandonado","delay_horas":0},
      {"tipo":"wait","delay_horas":24},
      {"tipo":"email","template":"Última chance","delay_horas":0}
    ]',
    true
  ),
  (
    'Pós-compra agradecimento',
    'Email de agradecimento após pagamento confirmado',
    'order.paid',
    '{}',
    '[
      {"tipo":"email","template":"Agradecimento","delay_horas":1}
    ]',
    true
  )
ON CONFLICT DO NOTHING;

-- Fluxo boas-vindas para novos cadastros (sem compra ainda)
INSERT INTO marketing.flows (nome, descricao, gatilho, gatilho_config, steps, ativo) VALUES
  (
    'Boas-vindas novo cadastro',
    'Email de boas-vindas quando cliente se cadastra na NuvemShop',
    'customer.created',
    '{}',
    '[
      {"tipo":"email","template":"Boas-vindas","delay_horas":0}
    ]',
    true
  )
ON CONFLICT DO NOTHING;

-- Migration 009_flow_engine aplicada em 2026-03-28
