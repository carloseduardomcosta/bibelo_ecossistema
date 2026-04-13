-- Migration 039: adiciona nível "iniciante" ao programa de revendedoras
-- Estrutura de níveis:
--   iniciante : volume < 150  → 15% desconto, frete por conta da revendedora
--   bronze    : volume 150+   → 20% desconto, frete por conta da revendedora
--   prata     : volume 600+   → 25% desconto, frete por conta da revendedora
--   ouro      : volume 1200+  → 30% desconto, frete GRÁTIS (por conta da Bibelô)

-- 1. Remover a constraint antiga e recriar com "iniciante" incluso
ALTER TABLE crm.revendedoras
  DROP CONSTRAINT IF EXISTS revendedoras_nivel_check;

ALTER TABLE crm.revendedoras
  ADD CONSTRAINT revendedoras_nivel_check
  CHECK (nivel IN ('iniciante', 'bronze', 'prata', 'ouro'));

-- 2. Atualizar o DEFAULT para "iniciante" (novas revendedoras entram no nível base)
ALTER TABLE crm.revendedoras
  ALTER COLUMN nivel SET DEFAULT 'iniciante';

-- 3. Revendedoras existentes que estão em 'bronze' com volume < 150 migram para 'iniciante'
--    (caso haja alguma; em produção provavelmente todas têm volume >= 150)
UPDATE crm.revendedoras
  SET nivel = 'iniciante',
      percentual_desconto = 15
  WHERE nivel = 'bronze'
    AND COALESCE(volume_mes_atual, 0) < 150;
