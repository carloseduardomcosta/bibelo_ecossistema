-- Migration 031: Instagram Business KPIs
-- Tabelas para acumular histórico orgânico do @papelariabibelo
-- ig-user-id: 17841478800595116

-- ── Métricas diárias da conta ─────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing.instagram_insights_daily (
  data            DATE        NOT NULL,
  impressoes      INTEGER     NOT NULL DEFAULT 0,
  alcance         INTEGER     NOT NULL DEFAULT 0,
  visitas_perfil  INTEGER     NOT NULL DEFAULT 0,
  seguidores      INTEGER     NOT NULL DEFAULT 0,
  cliques_site    INTEGER     NOT NULL DEFAULT 0,
  cliques_email   INTEGER     NOT NULL DEFAULT 0,
  cliques_tel     INTEGER     NOT NULL DEFAULT 0,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (data)
);

-- ── Posts com métricas ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing.instagram_posts (
  ig_media_id     TEXT        NOT NULL,
  tipo            TEXT        NOT NULL DEFAULT 'IMAGE', -- IMAGE | VIDEO | CAROUSEL_ALBUM | REEL
  caption         TEXT,
  permalink       TEXT,
  thumbnail_url   TEXT,
  media_url       TEXT,
  publicado_em    TIMESTAMPTZ,
  curtidas        INTEGER     NOT NULL DEFAULT 0,
  comentarios     INTEGER     NOT NULL DEFAULT 0,
  compartilhados  INTEGER     NOT NULL DEFAULT 0,
  salvamentos     INTEGER     NOT NULL DEFAULT 0,
  impressoes      INTEGER     NOT NULL DEFAULT 0,
  alcance         INTEGER     NOT NULL DEFAULT 0,
  plays           INTEGER     NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ig_media_id)
);

-- ── Audiência — snapshot semanal ─────────────────────────────
CREATE TABLE IF NOT EXISTS marketing.instagram_audience (
  id          SERIAL      NOT NULL,
  snapshot_em DATE        NOT NULL,
  tipo        TEXT        NOT NULL, -- 'gender_age' | 'city' | 'country'
  chave       TEXT        NOT NULL, -- ex: 'F.25-34', 'Blumenau, SC', 'BR'
  valor       INTEGER     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (snapshot_em, tipo, chave)
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ig_insights_data
  ON marketing.instagram_insights_daily (data DESC);

CREATE INDEX IF NOT EXISTS idx_ig_posts_publicado
  ON marketing.instagram_posts (publicado_em DESC);

CREATE INDEX IF NOT EXISTS idx_ig_posts_engagement
  ON marketing.instagram_posts (engagement_rate DESC);

CREATE INDEX IF NOT EXISTS idx_ig_audience_snapshot
  ON marketing.instagram_audience (snapshot_em DESC, tipo);
