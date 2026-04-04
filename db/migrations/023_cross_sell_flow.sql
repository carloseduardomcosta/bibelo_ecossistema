-- Migration 023: Fluxo automático de cross-sell pós-compra
-- Envia email 3 dias após compra com produtos complementares

INSERT INTO marketing.flows (id, nome, gatilho, gatilho_config, steps, ativo)
VALUES (
  uuid_generate_v4(),
  'Cross-sell pós-compra',
  'order.paid',
  '{"delay_horas": 72}',
  '[
    {"tipo": "wait", "delay_horas": 72},
    {"tipo": "condicao", "condicao_tipo": "comprou", "targetIndex": {"sim": -1, "nao": 2}},
    {"tipo": "email", "template": "cross-sell complemento", "delay_horas": 0},
    {"tipo": "wait", "delay_horas": 168},
    {"tipo": "condicao", "condicao_tipo": "email_clicado", "targetIndex": {"sim": 5, "nao": -1}},
    {"tipo": "email", "template": "cross-sell lembrete", "delay_horas": 0}
  ]'::jsonb,
  true
)
ON CONFLICT DO NOTHING;
