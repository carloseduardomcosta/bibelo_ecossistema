-- Migration 025: Fluxo de carrinho abandonado via tracking comportamental
-- Detecta add_to_cart sem checkout em 30min (não depende do checkout da NuvemShop)

INSERT INTO marketing.flows (id, nome, gatilho, gatilho_config, steps, ativo)
VALUES (
  uuid_generate_v4(),
  'Carrinho tracking abandonado',
  'cart.tracking',
  '{}',
  '[
    {"tipo": "email", "template": "carrinho tracking itens esperando", "delay_horas": 0},
    {"tipo": "wait", "delay_horas": 24},
    {"tipo": "condicao", "condicao_tipo": "comprou", "targetIndex": {"sim": -1, "nao": 3}},
    {"tipo": "email", "template": "carrinho tracking ultima chance", "delay_horas": 0}
  ]'::jsonb,
  true
)
ON CONFLICT DO NOTHING;
