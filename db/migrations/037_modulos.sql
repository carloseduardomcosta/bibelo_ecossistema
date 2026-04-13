-- Migration 037: Scaffold de módulos/assinaturas para revendedoras
-- Data: 13/04/2026

-- Catálogo de módulos disponíveis
CREATE TABLE IF NOT EXISTS crm.modulos (
  id           VARCHAR(50) PRIMARY KEY,
  nome         VARCHAR(200) NOT NULL,
  descricao    TEXT,
  preco_mensal NUMERIC(8,2),
  ativo        BOOLEAN DEFAULT true,
  criado_em    TIMESTAMPTZ DEFAULT NOW()
);

-- Assinaturas ativas por revendedora
CREATE TABLE IF NOT EXISTS crm.revendedora_modulos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revendedora_id UUID NOT NULL REFERENCES crm.revendedoras(id) ON DELETE CASCADE,
  modulo_id      VARCHAR(50) NOT NULL REFERENCES crm.modulos(id),
  ativo_desde    TIMESTAMPTZ DEFAULT NOW(),
  expira_em      TIMESTAMPTZ,
  plano          VARCHAR(20),
  criado_em      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(revendedora_id, modulo_id)
);

CREATE INDEX IF NOT EXISTS idx_rev_modulos_rev ON crm.revendedora_modulos(revendedora_id);

-- Seed: módulos iniciais (todos em estado "em breve")
INSERT INTO crm.modulos (id, nome, descricao, preco_mensal, ativo) VALUES
  ('fluxo_caixa',       'Fluxo de Caixa',       'Controle de receitas e despesas da sua revenda', 0.00, false),
  ('relatorio_vendas',  'Relatório de Vendas',   'Análise de desempenho mensal e histórico',       0.00, false),
  ('meta_mensal',       'Meta Mensal',           'Defina metas e acompanhe o progresso',           0.00, false),
  ('catalogo_digital',  'Catálogo Digital',      'Link de catálogo personalizado para clientes',   0.00, false)
ON CONFLICT (id) DO NOTHING;
