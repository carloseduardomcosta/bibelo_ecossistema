-- Migration 046 — Documenta colunas de enriquecimento do catálogo JC Atacado
-- Adicionadas live em 13/04/2026 (sem migration file na época)
-- Este arquivo documenta e garante que ambientes novos recebam as colunas

ALTER TABLE sync.fornecedor_catalogo_jc
  ADD COLUMN IF NOT EXISTS produto_url   VARCHAR(300),
  ADD COLUMN IF NOT EXISTS imagens_urls  TEXT[],
  ADD COLUMN IF NOT EXISTS descricao     TEXT;

-- Índice para localizar produtos com URL mas sem galeria (usado pelo enriquecedor fase 2)
CREATE INDEX IF NOT EXISTS idx_fcat_sem_galeria
  ON sync.fornecedor_catalogo_jc (id)
  WHERE produto_url IS NOT NULL AND imagens_urls IS NULL;

-- Índice para localizar produtos com preço desatualizado (usado pelo atualizar-precos)
CREATE INDEX IF NOT EXISTS idx_fcat_atualizado_em
  ON sync.fornecedor_catalogo_jc (atualizado_em);
