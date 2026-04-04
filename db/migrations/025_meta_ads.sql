-- Migration 025: Tabelas Meta Ads — persistir insights para análise histórica
-- Sync automático via BullMQ a cada 6h

-- Campanhas Meta (metadata)
CREATE TABLE IF NOT EXISTS marketing.meta_campaigns (
  id TEXT PRIMARY KEY,                    -- ID da campanha na Meta
  nome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  objetivo TEXT,
  orcamento_diario NUMERIC(12,2),
  orcamento_total NUMERIC(12,2),
  inicio_em TIMESTAMPTZ,
  fim_em TIMESTAMPTZ,
  criado_meta_em TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Insights diários por campanha (tabela principal para histórico)
CREATE TABLE IF NOT EXISTS marketing.meta_insights_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id TEXT NOT NULL REFERENCES marketing.meta_campaigns(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  investimento NUMERIC(12,4) DEFAULT 0,
  impressoes INT DEFAULT 0,
  alcance INT DEFAULT 0,
  cliques INT DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  cpc NUMERIC(12,4) DEFAULT 0,
  cpm NUMERIC(12,4) DEFAULT 0,
  compras INT DEFAULT 0,
  add_to_cart INT DEFAULT 0,
  checkout INT DEFAULT 0,
  leads INT DEFAULT 0,
  link_clicks INT DEFAULT 0,
  page_views INT DEFAULT 0,
  roas NUMERIC(8,2) DEFAULT 0,
  acoes JSONB DEFAULT '[]',
  sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, data)
);

-- Insights conta total por dia (sem breakdown de campanha)
CREATE TABLE IF NOT EXISTS marketing.meta_insights_account (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data DATE NOT NULL UNIQUE,
  investimento NUMERIC(12,4) DEFAULT 0,
  impressoes INT DEFAULT 0,
  alcance INT DEFAULT 0,
  cliques INT DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  cpc NUMERIC(12,4) DEFAULT 0,
  cpm NUMERIC(12,4) DEFAULT 0,
  compras INT DEFAULT 0,
  roas NUMERIC(8,2) DEFAULT 0,
  sincronizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Breakdown demográfico por dia
CREATE TABLE IF NOT EXISTS marketing.meta_demographics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data DATE NOT NULL,
  faixa_etaria TEXT NOT NULL,       -- '18-24', '25-34', '35-44', '45-54', '55-64', '65+'
  genero TEXT NOT NULL,             -- 'female', 'male', 'unknown'
  investimento NUMERIC(12,4) DEFAULT 0,
  impressoes INT DEFAULT 0,
  alcance INT DEFAULT 0,
  cliques INT DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  cpc NUMERIC(12,4) DEFAULT 0,
  sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(data, faixa_etaria, genero)
);

-- Breakdown geográfico por dia
CREATE TABLE IF NOT EXISTS marketing.meta_geographic (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data DATE NOT NULL,
  regiao TEXT NOT NULL,             -- estado brasileiro
  investimento NUMERIC(12,4) DEFAULT 0,
  impressoes INT DEFAULT 0,
  alcance INT DEFAULT 0,
  cliques INT DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  cpc NUMERIC(12,4) DEFAULT 0,
  sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(data, regiao)
);

-- Breakdown por plataforma por dia
CREATE TABLE IF NOT EXISTS marketing.meta_platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data DATE NOT NULL,
  plataforma TEXT NOT NULL,         -- 'facebook', 'instagram', 'audience_network', 'messenger'
  investimento NUMERIC(12,4) DEFAULT 0,
  impressoes INT DEFAULT 0,
  alcance INT DEFAULT 0,
  cliques INT DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  cpc NUMERIC(12,4) DEFAULT 0,
  cpm NUMERIC(12,4) DEFAULT 0,
  sincronizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(data, plataforma)
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_meta_insights_daily_data ON marketing.meta_insights_daily(data);
CREATE INDEX IF NOT EXISTS idx_meta_insights_daily_campaign ON marketing.meta_insights_daily(campaign_id, data);
CREATE INDEX IF NOT EXISTS idx_meta_insights_account_data ON marketing.meta_insights_account(data);
CREATE INDEX IF NOT EXISTS idx_meta_demographics_data ON marketing.meta_demographics(data);
CREATE INDEX IF NOT EXISTS idx_meta_geographic_data ON marketing.meta_geographic(data);
CREATE INDEX IF NOT EXISTS idx_meta_platforms_data ON marketing.meta_platforms(data);
