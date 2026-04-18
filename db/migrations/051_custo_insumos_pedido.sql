-- Migration 051: custo médio de insumos por pedido (embalagem, saquinho, brindes etc.)
-- Valor em centavos (300 = R$ 3,00)
INSERT INTO public.store_settings (categoria, chave, valor, descricao, tipo, ordem)
VALUES ('financeiro', 'custo_insumos_pedido', '300', 'Custo médio de insumos por pedido (embalagem, saquinho, cartão, brinde, etiqueta)', 'number', 1)
ON CONFLICT (categoria, chave) DO NOTHING;
