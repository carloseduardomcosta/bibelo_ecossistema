-- Migration 050: Tabela de insights acumulativos de campanhas Meta Ads
-- Armazena aprendizados automáticos e manuais para melhorar campanhas futuras

CREATE TABLE IF NOT EXISTS marketing.meta_campaign_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            VARCHAR(20)  NOT NULL DEFAULT 'manual',   -- 'automatico' | 'manual'
  categoria       VARCHAR(50)  NOT NULL,                    -- 'publico' | 'criativo' | 'orcamento' | 'plataforma' | 'objetivo' | 'regiao' | 'geral'
  impacto         VARCHAR(20)  NOT NULL DEFAULT 'neutro',   -- 'positivo' | 'negativo' | 'neutro' | 'dica'
  titulo          VARCHAR(300) NOT NULL,
  descricao       TEXT,
  campanha_ref    VARCHAR(200),                             -- nome da campanha que originou o insight
  dados_json      JSONB,                                    -- métricas de suporte
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_insights_categoria  ON marketing.meta_campaign_insights (categoria);
CREATE INDEX IF NOT EXISTS idx_meta_insights_criado_em  ON marketing.meta_campaign_insights (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_meta_insights_tipo       ON marketing.meta_campaign_insights (tipo);
