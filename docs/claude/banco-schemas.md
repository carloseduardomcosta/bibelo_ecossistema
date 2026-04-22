# Banco de dados — schemas e tabelas

## crm
`customers` (campos extras: `fantasia VARCHAR(255)`, `ie VARCHAR(50)` — migration 045), `customer_scores`, `interactions`, `deals`, `segments`, `tracking_events`, `visitor_customers`

`order_items` (id UUID PK, source VARCHAR[bling/nuvemshop], order_id VARCHAR, customer_id UUID FK, posicao INT, sku VARCHAR, nome VARCHAR, quantidade NUMERIC, valor_unitario NUMERIC, image_url TEXT, product_ref VARCHAR, criado_em TIMESTAMPTZ — migration 054. UNIQUE (source, order_id, posicao). Desnormaliza itens de bling_orders + nuvemshop_orders para queries de recompra/cross-sell sem jsonb_array_elements)

`notificacoes_operador` (id UUID PK, tipo VARCHAR[carrinho_abandonado_alto_valor/cliente_high_intent/cliente_vip_inativo/novo_membro_grupo_vip/whatsapp_step], customer_id UUID FK, titulo VARCHAR(300), descricao TEXT, dados JSONB, whatsapp VARCHAR(30), link_direto TEXT, status VARCHAR[pendente/enviado/ignorado] DEFAULT pendente, created_at, updated_at — migration 055. Índice parcial UNIQUE (tipo, customer_id) WHERE status = 'pendente' para dedup. Links wa.me pré-preenchidos para o operador enviar no WhatsApp)

`modulos` (id VARCHAR PK, nome, descricao, ativo BOOL, preco_mensal NUMERIC — módulos assinatura Sou Parceira. IDs ativos: `fluxo_caixa`, `relatorio_vendas` a R$7,90/mês)

`revendedora_modulos` (revendedora_id, modulo_id PK, ativo_desde, expira_em, plano[mensal/anual], status[ativo], ultimo_pagamento_em — migration 052 adicionou `status`, `ultimo_pagamento_em`, `proximo_vencimento_em`)

`modulo_pagamentos` (id UUID PK, revendedora_id, modulo_id, plano, valor, external_reference UNIQUE, mp_payment_id, mp_order_id, status[pendente/aprovado/rejeitado/cancelado], metodo_pagamento, qr_code, qr_code_base64, ticket_url, expira_pix_em, periodo_inicio, periodo_fim — migration 052)

`revendedora_vendas` (id UUID PK, revendedora_id, descricao VARCHAR(300), valor NUMERIC, data_venda DATE, categoria VARCHAR(100) — vendas próprias registradas pela parceira no módulo Fluxo de Caixa — migration 052)

## marketing
`templates`, `campaigns`, `campaign_sends`, `flows`, `flow_executions`, `flow_step_executions`, `pedidos_pendentes`, `leads`, `popup_config`, `email_events`

## sync
`bling_orders`, `bling_customers`, `nuvemshop_orders` (coluna `cupom` para tracking), `sync_logs`, `sync_state`, `product_publish_control` (porta de publicação Bling→Medusa — colunas: sku PK, bling_id, medusa_id, status[pending/approved/rejected/auto], missing_image, missing_price, unmapped_category, nome_original, categoria_bling, motivo, updated_at), `bling_medusa_categories` (coluna extra: `auto_approve BOOLEAN DEFAULT false`)

## financeiro
`categorias`, `lancamentos`, `despesas_fixas`, `despesas_fixas_pagamentos`, `custos_embalagem`, `kits_embalagem`, `kit_itens`, `canais_venda`, `notas_entrada`, `notas_entrada_itens`

## public
`users`, `sessions`, `migrations`
