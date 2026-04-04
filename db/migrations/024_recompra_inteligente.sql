-- Migration 024: Fluxo de recompra inteligente
-- Dispara quando cliente com ciclo de recompra está "atrasado"
-- Envia email com produtos que costuma comprar

INSERT INTO marketing.flows (id, nome, gatilho, gatilho_config, steps, ativo)
VALUES (
  uuid_generate_v4(),
  'Recompra inteligente',
  'order.recompra',
  '{}',
  '[
    {"tipo": "email", "template": "recompra favoritos", "delay_horas": 0},
    {"tipo": "wait", "delay_horas": 120},
    {"tipo": "condicao", "condicao_tipo": "comprou", "targetIndex": {"sim": -1, "nao": 3}},
    {"tipo": "email", "template": "lembrete recompra favoritos esperando", "delay_horas": 0}
  ]'::jsonb,
  true
)
ON CONFLICT DO NOTHING;
