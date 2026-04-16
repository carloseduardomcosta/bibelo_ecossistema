# Banco de dados — schemas e tabelas

## crm
`customers` (campos extras: `fantasia VARCHAR(255)`, `ie VARCHAR(50)` — migration 045), `customer_scores`, `interactions`, `deals`, `segments`, `tracking_events`, `visitor_customers`

## marketing
`templates`, `campaigns`, `campaign_sends`, `flows`, `flow_executions`, `flow_step_executions`, `pedidos_pendentes`, `leads`, `popup_config`, `email_events`

## sync
`bling_orders`, `bling_customers`, `nuvemshop_orders` (coluna `cupom` para tracking), `sync_logs`, `sync_state`, `product_publish_control` (porta de publicação Bling→Medusa — colunas: sku PK, bling_id, medusa_id, status[pending/approved/rejected/auto], missing_image, missing_price, unmapped_category, nome_original, categoria_bling, motivo, updated_at), `bling_medusa_categories` (coluna extra: `auto_approve BOOLEAN DEFAULT false`)

## financeiro
`categorias`, `lancamentos`, `despesas_fixas`, `despesas_fixas_pagamentos`, `custos_embalagem`, `kits_embalagem`, `kit_itens`, `canais_venda`, `notas_entrada`, `notas_entrada_itens`

## public
`users`, `sessions`, `migrations`
