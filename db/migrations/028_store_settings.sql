-- Configurações da Loja Online
-- Armazena configs editáveis pelo CRM que o storefront consome

CREATE TABLE IF NOT EXISTS public.store_settings (
  id         SERIAL PRIMARY KEY,
  categoria  VARCHAR(50)  NOT NULL,  -- pagamento, frete, checkout, geral, marketing
  chave      VARCHAR(100) NOT NULL,
  valor      TEXT         NOT NULL DEFAULT '',
  tipo       VARCHAR(20)  NOT NULL DEFAULT 'text', -- text, number, boolean, json
  label      VARCHAR(200) NOT NULL DEFAULT '',
  descricao  TEXT,
  ordem      INT          NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(categoria, chave)
);

-- ═══ Pagamento ═══════════════════════════════════════════
INSERT INTO public.store_settings (categoria, chave, valor, tipo, label, descricao, ordem) VALUES
('pagamento', 'pix_ativo',           'true',  'boolean', 'Pix ativo',              'Aceitar pagamento via Pix', 1),
('pagamento', 'pix_desconto',        '5',     'number',  'Desconto Pix (%)',       'Desconto para pagamentos via Pix', 2),
('pagamento', 'cartao_ativo',        'true',  'boolean', 'Cartão de crédito ativo','Aceitar cartão de crédito', 3),
('pagamento', 'cartao_parcelas_max', '12',    'number',  'Parcelas máximas',       'Número máximo de parcelas no cartão', 4),
('pagamento', 'cartao_parcela_min',  '500',   'number',  'Parcela mínima (centavos)','Valor mínimo de cada parcela em centavos (ex: 500 = R$5)', 5),
('pagamento', 'cartao_juros',        '0',     'number',  'Juros por parcela (%)',  'Percentual de juros por parcela (0 = sem juros)', 6),
('pagamento', 'boleto_ativo',        'true',  'boolean', 'Boleto ativo',           'Aceitar pagamento via boleto bancário', 7),
('pagamento', 'boleto_prazo_dias',   '3',     'number',  'Prazo boleto (dias)',    'Dias úteis para vencimento do boleto', 8)
ON CONFLICT (categoria, chave) DO NOTHING;

-- ═══ Frete ═══════════════════════════════════════════════
INSERT INTO public.store_settings (categoria, chave, valor, tipo, label, descricao, ordem) VALUES
('frete', 'frete_gratis_ativo',     'true',  'boolean', 'Frete grátis ativo',      'Ativar frete grátis acima de um valor', 1),
('frete', 'frete_gratis_valor',     '7900',  'number',  'Valor mín. frete grátis (centavos)', 'Valor mínimo do pedido para frete grátis (7900 = R$79)', 2),
('frete', 'frete_gratis_regioes',   '["Sul","Sudeste"]', 'json', 'Regiões frete grátis', 'Regiões que ganham frete grátis', 3),
('frete', 'retirada_ativo',         'true',  'boolean', 'Retirada na loja',        'Permitir retirada na loja física', 4),
('frete', 'retirada_endereco',      'R. Mal. Floriano Peixoto, 941 — Padre Martinho Stein — Timbó/SC', 'text', 'Endereço da loja', 'Endereço exibido para retirada', 5),
('frete', 'retirada_horario',       'Seg-Sex 9h-18h | Sáb 9h-13h', 'text', 'Horário da loja', 'Horário de funcionamento para retirada', 6)
ON CONFLICT (categoria, chave) DO NOTHING;

-- ═══ Checkout ════════════════════════════════════════════
INSERT INTO public.store_settings (categoria, chave, valor, tipo, label, descricao, ordem) VALUES
('checkout', 'checkout_mensagem',    '', 'text',    'Mensagem no checkout',    'Mensagem exibida no topo do checkout (ex: promoção)', 1),
('checkout', 'checkout_whatsapp',    'true', 'boolean', 'Botão WhatsApp no checkout', 'Exibir botão de ajuda via WhatsApp durante o checkout', 2),
('checkout', 'checkout_cupom',       'true', 'boolean', 'Campo de cupom',        'Exibir campo para aplicar cupom de desconto', 3),
('checkout', 'checkout_conta_obrig', 'false', 'boolean', 'Conta obrigatória',    'Exigir criação de conta para comprar', 4)
ON CONFLICT (categoria, chave) DO NOTHING;

-- ═══ Geral ═══════════════════════════════════════════════
INSERT INTO public.store_settings (categoria, chave, valor, tipo, label, descricao, ordem) VALUES
('geral', 'loja_nome',              'Papelaria Bibelô', 'text', 'Nome da loja', 'Nome exibido no site', 1),
('geral', 'loja_telefone',          '(47) 9 3386-2514', 'text', 'Telefone',     'Telefone principal', 2),
('geral', 'loja_email',             'contato@papelariabibelo.com.br', 'text', 'E-mail', 'E-mail de contato', 3),
('geral', 'loja_horario',           'Seg-Sex 9h-18h | Sáb 9h-13h', 'text', 'Horário', 'Horário de funcionamento', 4),
('geral', 'loja_endereco',          'R. Mal. Floriano Peixoto, 941 — Padre Martinho Stein — Timbó/SC — CEP 89093-880', 'text', 'Endereço completo', 'Endereço da loja física', 5),
('geral', 'loja_cnpj',              '63.961.764/0001-63', 'text', 'CNPJ', 'CNPJ da empresa', 6),
('geral', 'loja_instagram',         'https://instagram.com/papelariabibelo', 'text', 'Instagram', 'Link do Instagram', 7),
('geral', 'loja_facebook',          'https://facebook.com/papelariabibelo', 'text', 'Facebook', 'Link do Facebook', 8)
ON CONFLICT (categoria, chave) DO NOTHING;

-- ═══ Marketing ═══════════════════════════════════════════
INSERT INTO public.store_settings (categoria, chave, valor, tipo, label, descricao, ordem) VALUES
('marketing', 'popup_ativo',         'true',  'boolean', 'Popup de desconto ativo', 'Exibir popup de captura na primeira visita', 1),
('marketing', 'popup_desconto',      '7',     'number',  'Desconto popup (%)',      'Desconto oferecido no popup', 2),
('marketing', 'popup_cupom',         'CLUBEBIBELO', 'text', 'Cupom do popup',       'Código do cupom gerado pelo popup', 3),
('marketing', 'banner_frete_gratis', 'true',  'boolean', 'Banner frete grátis',     'Exibir banner de frete grátis nos emails e site', 4),
('marketing', 'selo_seguranca',      'true',  'boolean', 'Selos de segurança',      'Exibir selos de segurança no checkout', 5)
ON CONFLICT (categoria, chave) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_store_settings_categoria ON public.store_settings(categoria);
