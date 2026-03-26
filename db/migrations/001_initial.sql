-- ══════════════════════════════════════════════════════════════
-- BibelôCRM — Migration 001 — Schema inicial
-- Ecossistema Bibelô
-- ══════════════════════════════════════════════════════════════

-- ── Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Schemas
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS marketing;
CREATE SCHEMA IF NOT EXISTS sync;

-- ══════════════════════════════════════════════════════════════
-- SCHEMA: crm
-- ══════════════════════════════════════════════════════════════

-- Clientes unificados (físico + online)
CREATE TABLE crm.customers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE,
  telefone      VARCHAR(30),
  cpf           VARCHAR(14) UNIQUE,
  data_nasc     DATE,
  canal_origem  VARCHAR(50) DEFAULT 'desconhecido',
  bling_id      VARCHAR(50) UNIQUE,
  nuvemshop_id  VARCHAR(50) UNIQUE,
  instagram     VARCHAR(100),
  cidade        VARCHAR(100),
  estado        VARCHAR(2),
  cep           VARCHAR(10),
  ativo         BOOLEAN DEFAULT true,
  criado_em     TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_email    ON crm.customers(email);
CREATE INDEX idx_customers_telefone ON crm.customers(telefone);
CREATE INDEX idx_customers_bling    ON crm.customers(bling_id);
CREATE INDEX idx_customers_ns       ON crm.customers(nuvemshop_id);
CREATE INDEX idx_customers_nome_trgm ON crm.customers USING GIN (nome gin_trgm_ops);

-- Score e LTV por cliente
CREATE TABLE crm.customer_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID NOT NULL REFERENCES crm.customers(id) ON DELETE CASCADE,
  ltv             NUMERIC(12,2) DEFAULT 0,
  ticket_medio    NUMERIC(10,2) DEFAULT 0,
  total_pedidos   INTEGER DEFAULT 0,
  score           INTEGER DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  frequencia_dias INTEGER,
  ultima_compra   TIMESTAMPTZ,
  risco_churn     VARCHAR(20) DEFAULT 'baixo',
  segmento        VARCHAR(50) DEFAULT 'novo',
  calculado_em    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id)
);

-- Histórico de interações
CREATE TABLE crm.interactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES crm.customers(id) ON DELETE CASCADE,
  tipo        VARCHAR(50) NOT NULL,
  canal       VARCHAR(50),
  descricao   TEXT,
  valor       NUMERIC(10,2),
  metadata    JSONB DEFAULT '{}',
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interactions_customer ON crm.interactions(customer_id);
CREATE INDEX idx_interactions_tipo     ON crm.interactions(tipo);
CREATE INDEX idx_interactions_criado   ON crm.interactions(criado_em DESC);

-- Negociações / pipeline
CREATE TABLE crm.deals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES crm.customers(id) ON DELETE CASCADE,
  titulo      VARCHAR(255),
  valor       NUMERIC(10,2) DEFAULT 0,
  etapa       VARCHAR(50) DEFAULT 'prospeccao',
  origem      VARCHAR(50),
  probabilidade INTEGER DEFAULT 50,
  fechamento_previsto DATE,
  notas       TEXT,
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Segmentos dinâmicos
CREATE TABLE crm.segments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT,
  criterio    JSONB NOT NULL DEFAULT '{}',
  total       INTEGER DEFAULT 0,
  ativo       BOOLEAN DEFAULT true,
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Segmentos padrão
INSERT INTO crm.segments (nome, descricao, criterio) VALUES
  ('Compradores recorrentes', 'Clientes com 2+ pedidos', '{"min_pedidos": 2}'),
  ('Alto ticket',             'Ticket médio acima de R$ 200', '{"min_ticket": 200}'),
  ('Inativos 60 dias',        'Sem compra há 60 dias', '{"inativo_dias": 60}'),
  ('Carrinho abandonado',     'Abandono nas últimas 48h', '{"abandono_horas": 48}'),
  ('Novos clientes',          'Primeiro pedido nos últimos 30 dias', '{"novo_dias": 30}'),
  ('VIP',                     'Top 5% em receita total', '{"percentil": 95}');

-- ══════════════════════════════════════════════════════════════
-- SCHEMA: marketing
-- ══════════════════════════════════════════════════════════════

-- Templates de e-mail e WhatsApp
CREATE TABLE marketing.templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(100) NOT NULL,
  canal       VARCHAR(20) NOT NULL CHECK (canal IN ('email', 'whatsapp')),
  categoria   VARCHAR(50),
  assunto     VARCHAR(255),
  html        TEXT,
  texto       TEXT,
  variaveis   JSONB DEFAULT '[]',
  ativo       BOOLEAN DEFAULT true,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Templates padrão
INSERT INTO marketing.templates (nome, canal, categoria, assunto, texto) VALUES
  ('Boas-vindas',         'email',    'onboarding',   'Bem-vindo(a) à Papelaria Bibelô!', 'Olá {{nome}}, seja bem-vindo(a)!'),
  ('Abandono carrinho',   'email',    'recuperacao',  'Você esqueceu algo especial...', 'Olá {{nome}}, seu carrinho está esperando.'),
  ('Pós-compra',          'email',    'retencao',     'Seu pedido foi confirmado!', 'Olá {{nome}}, seu pedido #{{numero}} foi confirmado.'),
  ('Reativação',          'email',    'recuperacao',  'Sentimos sua falta...', 'Olá {{nome}}, faz tempo que não te vemos!'),
  ('Confirmação pedido',  'whatsapp', 'transacional', NULL, 'Olá {{nome}}! Seu pedido #{{numero}} foi confirmado. Valor: R$ {{valor}}. Obrigada! 🎀'),
  ('Rastreio envio',      'whatsapp', 'transacional', NULL, 'Olá {{nome}}! Seu pedido foi enviado. Rastreio: {{codigo}}. Prazo: {{prazo}} dias úteis.');

-- Campanhas
CREATE TABLE marketing.campaigns (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(255) NOT NULL,
  canal       VARCHAR(20) NOT NULL CHECK (canal IN ('email', 'whatsapp')),
  template_id UUID REFERENCES marketing.templates(id),
  segment_id  UUID REFERENCES crm.segments(id),
  status      VARCHAR(20) DEFAULT 'rascunho' CHECK (status IN ('rascunho','agendada','enviando','ativa','pausada','concluida')),
  agendado_em TIMESTAMPTZ,
  enviado_em  TIMESTAMPTZ,
  total_envios    INTEGER DEFAULT 0,
  total_abertos   INTEGER DEFAULT 0,
  total_cliques   INTEGER DEFAULT 0,
  total_conversoes INTEGER DEFAULT 0,
  receita_atribuida NUMERIC(12,2) DEFAULT 0,
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Registro individual de cada envio
CREATE TABLE marketing.campaign_sends (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES marketing.campaigns(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES crm.customers(id) ON DELETE CASCADE,
  status      VARCHAR(20) DEFAULT 'pendente',
  message_id  VARCHAR(255),
  aberto_em   TIMESTAMPTZ,
  clicado_em  TIMESTAMPTZ,
  enviado_em  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, customer_id)
);

CREATE INDEX idx_sends_campaign ON marketing.campaign_sends(campaign_id);
CREATE INDEX idx_sends_customer ON marketing.campaign_sends(customer_id);
CREATE INDEX idx_sends_status   ON marketing.campaign_sends(status);

-- Fluxos automáticos
CREATE TABLE marketing.flows (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT,
  gatilho     VARCHAR(50) NOT NULL,
  gatilho_config JSONB DEFAULT '{}',
  steps       JSONB NOT NULL DEFAULT '[]',
  ativo       BOOLEAN DEFAULT false,
  total_ativos    INTEGER DEFAULT 0,
  total_conversoes INTEGER DEFAULT 0,
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Fluxos padrão
INSERT INTO marketing.flows (nome, descricao, gatilho, steps, ativo) VALUES
  (
    'Boas-vindas novo cliente',
    'Sequência automática para primeiro pedido',
    'order.first',
    '[
      {"tipo":"email","template":"Boas-vindas","delay_horas":0},
      {"tipo":"wait","delay_horas":72},
      {"tipo":"whatsapp","template":"Confirmação pedido","delay_horas":0},
      {"tipo":"wait","delay_horas":360},
      {"tipo":"email","template":"Pós-compra","delay_horas":0}
    ]',
    true
  ),
  (
    'Recuperação inativo',
    'Reativar clientes sem compra há 45 dias',
    'customer.inactive',
    '[
      {"tipo":"email","template":"Reativação","delay_horas":0},
      {"tipo":"wait","delay_horas":120},
      {"tipo":"whatsapp","template":"Confirmação pedido","delay_horas":0}
    ]',
    true
  );

-- Execuções de fluxo por cliente
CREATE TABLE marketing.flow_executions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id     UUID NOT NULL REFERENCES marketing.flows(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES crm.customers(id) ON DELETE CASCADE,
  step_atual  INTEGER DEFAULT 0,
  status      VARCHAR(20) DEFAULT 'ativo',
  iniciado_em TIMESTAMPTZ DEFAULT NOW(),
  concluido_em TIMESTAMPTZ,
  UNIQUE(flow_id, customer_id)
);

-- ══════════════════════════════════════════════════════════════
-- SCHEMA: sync
-- ══════════════════════════════════════════════════════════════

-- Pedidos vindos do Bling
CREATE TABLE sync.bling_orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bling_id      VARCHAR(50) UNIQUE NOT NULL,
  customer_id   UUID REFERENCES crm.customers(id),
  numero        VARCHAR(50),
  valor         NUMERIC(10,2),
  status        VARCHAR(50),
  canal         VARCHAR(50) DEFAULT 'fisico',
  itens         JSONB DEFAULT '[]',
  sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
  criado_bling  TIMESTAMPTZ
);

CREATE INDEX idx_bling_orders_customer ON sync.bling_orders(customer_id);
CREATE INDEX idx_bling_orders_status   ON sync.bling_orders(status);

-- Clientes vindos do Bling
CREATE TABLE sync.bling_customers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bling_id      VARCHAR(50) UNIQUE NOT NULL,
  customer_id   UUID REFERENCES crm.customers(id),
  dados_raw     JSONB DEFAULT '{}',
  ultima_sync   TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos vindos da NuvemShop via webhook
CREATE TABLE sync.nuvemshop_orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ns_id         VARCHAR(50) UNIQUE NOT NULL,
  customer_id   UUID REFERENCES crm.customers(id),
  numero        VARCHAR(50),
  valor         NUMERIC(10,2),
  status        VARCHAR(50),
  itens         JSONB DEFAULT '[]',
  webhook_em    TIMESTAMPTZ DEFAULT NOW(),
  processado    BOOLEAN DEFAULT false
);

CREATE INDEX idx_ns_orders_customer  ON sync.nuvemshop_orders(customer_id);
CREATE INDEX idx_ns_orders_processado ON sync.nuvemshop_orders(processado);

-- Log de todas as sincronizações
CREATE TABLE sync.sync_logs (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fonte     VARCHAR(50) NOT NULL,
  tipo      VARCHAR(50) NOT NULL,
  status    VARCHAR(20) DEFAULT 'ok',
  registros INTEGER DEFAULT 0,
  erro      TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_fonte   ON sync.sync_logs(fonte);
CREATE INDEX idx_sync_logs_criado  ON sync.sync_logs(criado_em DESC);

-- Controle de última sync por fonte
CREATE TABLE sync.sync_state (
  fonte         VARCHAR(50) PRIMARY KEY,
  ultimo_id     VARCHAR(100),
  ultima_sync   TIMESTAMPTZ DEFAULT NOW(),
  total_sincronizados INTEGER DEFAULT 0
);

INSERT INTO sync.sync_state (fonte) VALUES ('bling'), ('nuvemshop');

-- ══════════════════════════════════════════════════════════════
-- Usuários do sistema (acesso ao CRM)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE public.users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  senha_hash    VARCHAR(255) NOT NULL,
  papel         VARCHAR(20) DEFAULT 'viewer' CHECK (papel IN ('admin','editor','viewer')),
  ativo         BOOLEAN DEFAULT true,
  ultimo_acesso TIMESTAMPTZ,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- Sessões / refresh tokens
CREATE TABLE public.sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  refresh_token VARCHAR(500) UNIQUE NOT NULL,
  ip            VARCHAR(45),
  user_agent    TEXT,
  expira_em     TIMESTAMPTZ NOT NULL,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user  ON public.sessions(user_id);
CREATE INDEX idx_sessions_token ON public.sessions(refresh_token);

-- ══════════════════════════════════════════════════════════════
-- Função para atualizar atualizado_em automaticamente
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customers_updated
  BEFORE UPDATE ON crm.customers
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER trg_deals_updated
  BEFORE UPDATE ON crm.deals
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER trg_campaigns_updated
  BEFORE UPDATE ON marketing.campaigns
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER trg_flows_updated
  BEFORE UPDATE ON marketing.flows
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();
