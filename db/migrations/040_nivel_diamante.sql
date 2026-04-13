-- Migration 040: adiciona nível "diamante" ao programa de revendedoras
-- Estrutura atualizada de níveis:
--   iniciante : volume < 150     → 15% desconto, frete por conta da revendedora
--   bronze    : volume 150–599   → 25% desconto, frete por conta da revendedora
--   prata     : volume 600–1199  → 35% desconto, frete por conta da revendedora
--   ouro      : volume 1200–2999 → 45% desconto, frete GRÁTIS (por conta da Bibelô)
--   diamante  : volume 3000+     → 45% desconto, frete GRÁTIS + benefícios exclusivos (topo)

-- 1. Recriar constraint com 'diamante'
ALTER TABLE crm.revendedoras
  DROP CONSTRAINT IF EXISTS revendedoras_nivel_check;

ALTER TABLE crm.revendedoras
  ADD CONSTRAINT revendedoras_nivel_check
  CHECK (nivel IN ('iniciante', 'bronze', 'prata', 'ouro', 'diamante'));

-- 2. Corrigir percentuais conforme nova tabela (revendedoras ativas existentes)
UPDATE crm.revendedoras SET percentual_desconto = 15 WHERE nivel = 'iniciante';
UPDATE crm.revendedoras SET percentual_desconto = 25 WHERE nivel = 'bronze';
UPDATE crm.revendedoras SET percentual_desconto = 35 WHERE nivel = 'prata';
UPDATE crm.revendedoras SET percentual_desconto = 45 WHERE nivel = 'ouro';
