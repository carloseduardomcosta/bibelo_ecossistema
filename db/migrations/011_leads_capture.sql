-- 011_leads_capture.sql — Caça-leads: captura de emails via popup no site
-- Substitui formulário do Edrone por sistema próprio do BibelôCRM

-- ── Leads capturados ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing.leads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) NOT NULL,
  nome            VARCHAR(200),
  telefone        VARCHAR(30),
  fonte           VARCHAR(50) DEFAULT 'popup',     -- popup, footer, manual
  popup_id        VARCHAR(50),                      -- qual popup capturou
  cupom           VARCHAR(50),                      -- cupom oferecido
  visitor_id      VARCHAR(100),                     -- cookie _bibelo_vid
  pagina          TEXT,                             -- URL onde capturou
  customer_id     UUID REFERENCES crm.customers(id) ON DELETE SET NULL,
  convertido      BOOLEAN DEFAULT false,            -- true se virou compra
  convertido_em   TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_leads_email ON marketing.leads(email);
CREATE INDEX idx_leads_criado ON marketing.leads(criado_em DESC);
CREATE INDEX idx_leads_convertido ON marketing.leads(convertido) WHERE convertido = false;

-- ── Config dos popups ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing.popup_config (
  id              VARCHAR(50) PRIMARY KEY,          -- ex: 'desconto_primeira_compra'
  titulo          VARCHAR(200) NOT NULL,
  subtitulo       TEXT,
  tipo            VARCHAR(30) DEFAULT 'timer',      -- timer, exit_intent, scroll
  delay_segundos  INTEGER DEFAULT 8,
  campos          JSONB DEFAULT '["email"]',        -- campos a capturar
  cupom           VARCHAR(50),                      -- cupom a oferecer
  desconto_texto  VARCHAR(100),                     -- ex: "10% OFF na primeira compra"
  ativo           BOOLEAN DEFAULT true,
  exibicoes       INTEGER DEFAULT 0,
  capturas        INTEGER DEFAULT 0,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- Popup padrão: desconto primeira compra
INSERT INTO marketing.popup_config (id, titulo, subtitulo, tipo, delay_segundos, campos, cupom, desconto_texto, ativo) VALUES
  (
    'desconto_primeira_compra',
    'Ganhe 10% na sua primeira compra!',
    'Cadastre seu e-mail e receba um cupom exclusivo de boas-vindas.',
    'timer',
    8,
    '["email", "nome"]',
    'BIBELO10',
    '10% OFF',
    true
  ),
  (
    'exit_intent',
    'Ei, não vai embora!',
    'Antes de sair, garanta 10% de desconto na sua primeira compra.',
    'exit_intent',
    0,
    '["email"]',
    'BIBELO10',
    '10% OFF',
    false
  )
ON CONFLICT DO NOTHING;

-- Migration 011_leads_capture aplicada em 2026-03-28
