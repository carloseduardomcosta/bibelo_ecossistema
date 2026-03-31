-- Migration 016: Corrige fluxos automáticos
-- 1. Remove UNIQUE(flow_id, customer_id) para permitir re-engajamento por janela temporal (90 dias)
-- 2. Reordena Nutrição de lead: Populares → Social → Cupom
-- 3. Remove steps de whatsapp dos fluxos (ainda não implementado)
-- 4. Desativa "Boas-vindas novo cadastro" (duplica com Lead boas-vindas cupom)
-- 5. Limpa execuções travadas

-- 1. Remove unique constraint que impede re-engajamento
ALTER TABLE marketing.flow_executions DROP CONSTRAINT IF EXISTS flow_executions_flow_id_customer_id_key;

-- Cria índice para performance das queries de janela temporal
CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_customer_date
  ON marketing.flow_executions (flow_id, customer_id, iniciado_em DESC);

-- 2. Reordena Nutrição de lead: Populares → Prova Social → Cupom (confiança antes de pressão)
UPDATE marketing.flows
SET steps = '[{"tipo":"wait","delay_horas":48},{"tipo":"email","template":"Produtos populares","delay_horas":0},{"tipo":"wait","delay_horas":48},{"tipo":"email","template":"Prova social avaliações","delay_horas":0},{"tipo":"wait","delay_horas":72},{"tipo":"email","template":"Lembrete cupom expirando","delay_horas":0}]'::jsonb,
    atualizado_em = NOW()
WHERE nome = 'Nutrição de lead';

-- 3. Remove steps whatsapp do "Boas-vindas novo cliente"
-- Antes: email → wait 72h → whatsapp → wait 360h → email Pós-compra
-- Depois: email → wait 72h → email Pós-compra (removeu whatsapp + wait desnecessário)
UPDATE marketing.flows
SET steps = '[{"tipo":"email","template":"Boas-vindas","delay_horas":0},{"tipo":"wait","delay_horas":72},{"tipo":"email","template":"Pós-compra","delay_horas":0}]'::jsonb,
    atualizado_em = NOW()
WHERE nome = 'Boas-vindas novo cliente';

-- 4. Remove steps whatsapp do "Recuperação inativo"
-- Antes: email → wait 120h → whatsapp
-- Depois: email Reativação (simples)
UPDATE marketing.flows
SET steps = '[{"tipo":"email","template":"Reativação","delay_horas":0}]'::jsonb,
    atualizado_em = NOW()
WHERE nome = 'Recuperação inativo';

-- 5. Desativa "Boas-vindas novo cadastro" — duplica com "Lead boas-vindas cupom"
-- customer.created dispara quando NuvemShop cria cliente, mas o fluxo lead.captured
-- já cuida da boas-vindas com cupom. Manter ativo = 2 emails de boas-vindas.
UPDATE marketing.flows
SET ativo = false, atualizado_em = NOW()
WHERE nome = 'Boas-vindas novo cadastro' AND gatilho = 'customer.created';

-- 6. Limpa execuções travadas
-- Macedo Teste sem email em Recuperação inativo
UPDATE marketing.flow_executions
SET status = 'cancelado', concluido_em = NOW()
WHERE status = 'ativo'
  AND customer_id IN (SELECT id FROM crm.customers WHERE email IS NULL);

-- Cancelar execuções com status 'executando' antigas (travadas)
UPDATE marketing.flow_executions
SET status = 'cancelado', concluido_em = NOW()
WHERE status = 'executando'
  AND proximo_step_em < NOW() - INTERVAL '1 hour';
