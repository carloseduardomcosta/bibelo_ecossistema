-- 032_revendedoras.sql
-- Clube de Revendedoras Bibelô — Gamificação + Portal B2B

-- Tabela principal: cadastro, nível, comercial, auth do portal
CREATE TABLE IF NOT EXISTS crm.revendedoras (
  id                      UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id             UUID          REFERENCES crm.customers(id) ON DELETE SET NULL,
  nome                    VARCHAR(255)  NOT NULL,
  email                   VARCHAR(255)  NOT NULL,
  telefone                VARCHAR(30),
  documento               VARCHAR(20),    -- CPF ou CNPJ
  cidade                  VARCHAR(100),
  estado                  VARCHAR(2),
  observacao              TEXT,
  -- Gamificação
  nivel                   VARCHAR(10)   NOT NULL DEFAULT 'bronze'
                          CHECK (nivel IN ('bronze', 'prata', 'ouro')),
  pontos                  INTEGER       NOT NULL DEFAULT 0,
  volume_mes_atual        NUMERIC(10,2) NOT NULL DEFAULT 0,
  volume_mes_anterior     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_vendido           NUMERIC(12,2) NOT NULL DEFAULT 0,
  meses_consecutivos      INTEGER       NOT NULL DEFAULT 0,
  meses_sem_pedido        INTEGER       NOT NULL DEFAULT 0,
  -- Comercial
  percentual_desconto     NUMERIC(5,2)  NOT NULL DEFAULT 20.00,
  pedido_minimo           NUMERIC(10,2) NOT NULL DEFAULT 300.00,
  -- Status
  status                  VARCHAR(20)   NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente', 'ativa', 'inativa', 'suspensa')),
  aprovada_em             TIMESTAMPTZ,
  aprovada_por            VARCHAR(255),
  -- Auth portal (magic link)
  portal_token            VARCHAR(100)  UNIQUE,
  portal_token_expira_em  TIMESTAMPTZ,
  portal_ultimo_acesso_em TIMESTAMPTZ,
  -- Meta
  criado_em               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_revendedoras_email
  ON crm.revendedoras (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_revendedoras_status
  ON crm.revendedoras (status);
CREATE INDEX IF NOT EXISTS idx_revendedoras_nivel
  ON crm.revendedoras (nivel);
CREATE INDEX IF NOT EXISTS idx_revendedoras_customer
  ON crm.revendedoras (customer_id) WHERE customer_id IS NOT NULL;

-- Estoque da revendedora (produtos em posse)
CREATE TABLE IF NOT EXISTS crm.revendedora_estoque (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  revendedora_id   UUID          NOT NULL REFERENCES crm.revendedoras(id) ON DELETE CASCADE,
  bling_produto_id VARCHAR(50),
  produto_nome     VARCHAR(255)  NOT NULL,
  produto_sku      VARCHAR(100),
  produto_imagem   TEXT,
  produto_preco    NUMERIC(10,2),
  quantidade       INTEGER       NOT NULL DEFAULT 0,
  quantidade_minima INTEGER      NOT NULL DEFAULT 3,
  custo_unitario   NUMERIC(10,2),
  preco_sugerido   NUMERIC(10,2),
  atualizado_em    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  criado_em        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (revendedora_id, bling_produto_id)
);

CREATE INDEX IF NOT EXISTS idx_rev_estoque_revendedora
  ON crm.revendedora_estoque (revendedora_id);
CREATE INDEX IF NOT EXISTS idx_rev_estoque_baixo
  ON crm.revendedora_estoque (revendedora_id)
  WHERE quantidade <= quantidade_minima;

-- Pedidos de reposição (revendedora → Bibelô)
CREATE TABLE IF NOT EXISTS crm.revendedora_pedidos (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  revendedora_id      UUID         NOT NULL REFERENCES crm.revendedoras(id) ON DELETE CASCADE,
  numero_pedido       VARCHAR(50)  NOT NULL UNIQUE,
  status              VARCHAR(30)  NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente', 'aprovado', 'enviado', 'entregue', 'cancelado')),
  subtotal            NUMERIC(10,2) NOT NULL,
  desconto_percentual NUMERIC(5,2)  NOT NULL DEFAULT 0,
  desconto_valor      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total               NUMERIC(10,2) NOT NULL,
  observacao          TEXT,
  itens               JSONB         NOT NULL DEFAULT '[]',
  criado_em           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  aprovado_em         TIMESTAMPTZ,
  enviado_em          TIMESTAMPTZ,
  entregue_em         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rev_pedidos_revendedora
  ON crm.revendedora_pedidos (revendedora_id);
CREATE INDEX IF NOT EXISTS idx_rev_pedidos_status
  ON crm.revendedora_pedidos (status);
CREATE INDEX IF NOT EXISTS idx_rev_pedidos_criado
  ON crm.revendedora_pedidos (criado_em DESC);

-- Conquistas / badges (gamificação)
CREATE TABLE IF NOT EXISTS crm.revendedora_conquistas (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  revendedora_id UUID         NOT NULL REFERENCES crm.revendedoras(id) ON DELETE CASCADE,
  tipo           VARCHAR(50)  NOT NULL,
  descricao      VARCHAR(255),
  pontos         INTEGER      NOT NULL DEFAULT 0,
  metadata       JSONB,
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (revendedora_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_rev_conquistas_revendedora
  ON crm.revendedora_conquistas (revendedora_id);
