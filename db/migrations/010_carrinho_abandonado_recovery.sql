-- 010_carrinho_abandonado_recovery.sql — Recovery URL e dados ricos do checkout
-- Permite buscar link de recuperação da NuvemShop e armazenar fotos dos produtos

-- Recovery URL do checkout NuvemShop
ALTER TABLE marketing.pedidos_pendentes
  ADD COLUMN IF NOT EXISTS recovery_url TEXT,
  ADD COLUMN IF NOT EXISTS checkout_id VARCHAR(50);

-- Migration 010_carrinho_abandonado_recovery aplicada em 2026-03-28
