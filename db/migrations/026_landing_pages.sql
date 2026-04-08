-- Landing pages para campanhas de marketing (captura de leads via ads)
CREATE TABLE IF NOT EXISTS marketing.landing_pages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          VARCHAR(100) UNIQUE NOT NULL,
  titulo        VARCHAR(255) NOT NULL,
  subtitulo     TEXT,
  imagem_url    TEXT,
  cor_primaria  VARCHAR(7) DEFAULT '#fe68c4',
  cor_fundo     VARCHAR(7) DEFAULT '#ffe5ec',
  cupom         VARCHAR(50),
  desconto_texto VARCHAR(50) DEFAULT '10% OFF',
  campos        JSONB DEFAULT '["email","nome"]'::jsonb,
  cta_texto     VARCHAR(100) DEFAULT 'Quero meu desconto',
  mensagem_sucesso TEXT DEFAULT 'Verifique seu e-mail para ativar o cupom!',
  redirect_url  TEXT DEFAULT 'https://www.papelariabibelo.com.br',
  redirect_delay INTEGER DEFAULT 5,
  utm_source    VARCHAR(100),
  utm_medium    VARCHAR(100),
  utm_campaign  VARCHAR(100),
  ativo         BOOLEAN DEFAULT true,
  visitas       INTEGER DEFAULT 0,
  capturas      INTEGER DEFAULT 0,
  criado_em     TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON marketing.landing_pages (slug) WHERE ativo = true;

CREATE TRIGGER trg_landing_pages_updated
  BEFORE UPDATE ON marketing.landing_pages
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- Landing page de exemplo
INSERT INTO marketing.landing_pages (slug, titulo, subtitulo, cupom, desconto_texto, utm_source, utm_medium, utm_campaign)
VALUES (
  'dia-das-maes',
  'Presente perfeito para a mãe!',
  'Cadastre-se e ganhe 10% OFF em papelaria fina, agenda e muito mais.',
  'BIBELO10',
  '10% OFF',
  'instagram',
  'ads',
  'dia-das-maes-2026'
) ON CONFLICT DO NOTHING;
