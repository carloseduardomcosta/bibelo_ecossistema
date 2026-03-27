-- ══════════════════════════════════════════════════════════════
-- BibelôCRM — Migration 005 — Módulo Financeiro
-- Fluxo de caixa, despesas fixas, custos operacionais, simulador
-- ══════════════════════════════════════════════════════════════

-- ── Schema dedicado ─────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS financeiro;

-- ══════════════════════════════════════════════════════════════
-- Categorias de receita e despesa
-- ══════════════════════════════════════════════════════════════
CREATE TABLE financeiro.categorias (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(100) NOT NULL,
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  cor         VARCHAR(7) DEFAULT '#8B5CF6',
  icone       VARCHAR(50),
  ativo       BOOLEAN DEFAULT true,
  ordem       INTEGER DEFAULT 0,
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(nome, tipo)
);

CREATE INDEX idx_categorias_tipo ON financeiro.categorias(tipo);

CREATE TRIGGER trg_categorias_updated
  BEFORE UPDATE ON financeiro.categorias
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ══════════════════════════════════════════════════════════════
-- Lançamentos (receitas e despesas)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE financeiro.lancamentos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data            DATE NOT NULL,
  descricao       VARCHAR(500) NOT NULL,
  categoria_id    UUID NOT NULL REFERENCES financeiro.categorias(id),
  tipo            VARCHAR(10) NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  valor           NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  status          VARCHAR(15) NOT NULL DEFAULT 'realizado' CHECK (status IN ('realizado', 'programado', 'cancelado')),
  observacoes     TEXT,
  qtd_vendas      INTEGER,
  forma_pagamento VARCHAR(30),
  referencia_id   UUID,
  referencia_tipo VARCHAR(30),
  criado_por      UUID REFERENCES public.users(id),
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lancamentos_data       ON financeiro.lancamentos(data);
CREATE INDEX idx_lancamentos_tipo       ON financeiro.lancamentos(tipo);
CREATE INDEX idx_lancamentos_status     ON financeiro.lancamentos(status);
CREATE INDEX idx_lancamentos_categoria  ON financeiro.lancamentos(categoria_id);
CREATE INDEX idx_lancamentos_data_mes    ON financeiro.lancamentos((EXTRACT(YEAR FROM data) * 100 + EXTRACT(MONTH FROM data)));

CREATE TRIGGER trg_lancamentos_updated
  BEFORE UPDATE ON financeiro.lancamentos
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ══════════════════════════════════════════════════════════════
-- Despesas fixas recorrentes (com controle de vencimento)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE financeiro.despesas_fixas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  descricao       VARCHAR(255) NOT NULL,
  categoria_id    UUID NOT NULL REFERENCES financeiro.categorias(id),
  valor           NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  dia_vencimento  INTEGER CHECK (dia_vencimento BETWEEN 1 AND 31),
  ativo           BOOLEAN DEFAULT true,
  observacoes     TEXT,
  data_inicio     DATE DEFAULT CURRENT_DATE,
  data_fim        DATE,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_despesas_fixas_updated
  BEFORE UPDATE ON financeiro.despesas_fixas
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ══════════════════════════════════════════════════════════════
-- Pagamentos de despesas fixas por mês (controle pago/pendente)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE financeiro.despesas_fixas_pagamentos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  despesa_fixa_id UUID NOT NULL REFERENCES financeiro.despesas_fixas(id) ON DELETE CASCADE,
  mes_referencia  DATE NOT NULL,
  valor_pago      NUMERIC(12,2),
  data_pagamento  DATE,
  status          VARCHAR(15) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado')),
  observacoes     TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(despesa_fixa_id, mes_referencia)
);

CREATE INDEX idx_df_pagamentos_mes    ON financeiro.despesas_fixas_pagamentos(mes_referencia);
CREATE INDEX idx_df_pagamentos_status ON financeiro.despesas_fixas_pagamentos(status);

CREATE TRIGGER trg_df_pagamentos_updated
  BEFORE UPDATE ON financeiro.despesas_fixas_pagamentos
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ══════════════════════════════════════════════════════════════
-- Custos de embalagem e kits
-- ══════════════════════════════════════════════════════════════
CREATE TABLE financeiro.custos_embalagem (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome            VARCHAR(255) NOT NULL,
  custo_unitario  NUMERIC(10,2) NOT NULL DEFAULT 0,
  unidade         VARCHAR(20) DEFAULT 'unid',
  observacoes     TEXT,
  ativo           BOOLEAN DEFAULT true,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_custos_embalagem_updated
  BEFORE UPDATE ON financeiro.custos_embalagem
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TABLE financeiro.kits_embalagem (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT,
  ativo       BOOLEAN DEFAULT true,
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_kits_embalagem_updated
  BEFORE UPDATE ON financeiro.kits_embalagem
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TABLE financeiro.kit_itens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kit_id          UUID NOT NULL REFERENCES financeiro.kits_embalagem(id) ON DELETE CASCADE,
  embalagem_id    UUID NOT NULL REFERENCES financeiro.custos_embalagem(id) ON DELETE CASCADE,
  quantidade      NUMERIC(10,2) NOT NULL DEFAULT 1,
  UNIQUE(kit_id, embalagem_id)
);

-- ══════════════════════════════════════════════════════════════
-- Simulador de marketplaces (taxas por canal de venda)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE financeiro.canais_venda (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome                VARCHAR(100) NOT NULL UNIQUE,
  taxa_venda_pct      NUMERIC(6,2) DEFAULT 0,
  taxa_fixa           NUMERIC(10,2) DEFAULT 0,
  taxa_pagamento_pct  NUMERIC(6,2) DEFAULT 0,
  observacoes         TEXT,
  ativo               BOOLEAN DEFAULT true,
  ordem               INTEGER DEFAULT 0,
  criado_em           TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_canais_venda_updated
  BEFORE UPDATE ON financeiro.canais_venda
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ══════════════════════════════════════════════════════════════
-- SEED: Categorias padrão
-- ══════════════════════════════════════════════════════════════
INSERT INTO financeiro.categorias (nome, tipo, cor, icone, ordem) VALUES
  -- Receitas
  ('Vendas à Vista',           'receita', '#10B981', 'banknote',       1),
  ('Vendas a Prazo',           'receita', '#34D399', 'credit-card',    2),
  ('Prestação de Serviços',    'receita', '#6EE7B7', 'briefcase',      3),
  ('Recebimentos de Clientes', 'receita', '#A7F3D0', 'user-check',     4),
  ('Outras Receitas',          'receita', '#D1FAE5', 'plus-circle',    5),
  -- Despesas
  ('Salários e Encargos',      'despesa', '#EF4444', 'users',          1),
  ('Fornecedores',             'despesa', '#F97316', 'truck',          2),
  ('Aluguel',                  'despesa', '#F59E0B', 'home',           3),
  ('Água, Luz e Telefone',     'despesa', '#EAB308', 'zap',            4),
  ('Impostos e Taxas',         'despesa', '#84CC16', 'file-text',      5),
  ('Manutenção e Reparos',     'despesa', '#22C55E', 'wrench',         6),
  ('Material de Escritório',   'despesa', '#14B8A6', 'pen-tool',       7),
  ('Combustível e Transporte', 'despesa', '#06B6D4', 'car',            8),
  ('Marketing e Publicidade',  'despesa', '#3B82F6', 'megaphone',      9),
  ('Serviços de Terceiros',    'despesa', '#6366F1', 'user-cog',      10),
  ('Despesas Financeiras',     'despesa', '#8B5CF6', 'trending-down', 11),
  ('Outras Despesas',          'despesa', '#A855F7', 'more-horizontal',12),
  ('Darf MEI',                 'despesa', '#D946EF', 'landmark',      13),
  ('ERP Bling',                'despesa', '#EC4899', 'database',      14),
  ('Canva PRO',                'despesa', '#F43F5E', 'palette',       15),
  ('Site',                     'despesa', '#FB923C', 'globe',         16),
  ('Certificado Digital A1 / Anual', 'despesa', '#FBBF24', 'shield', 17),
  ('Bala',                     'despesa', '#A3E635', 'candy',         18)
ON CONFLICT (nome, tipo) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- SEED: Canais de venda padrão (taxas da planilha)
-- ══════════════════════════════════════════════════════════════
INSERT INTO financeiro.canais_venda (nome, taxa_venda_pct, taxa_fixa, taxa_pagamento_pct, ordem) VALUES
  ('NuvemShop (Cartão)',  0.00, 0.35,  5.69, 1),
  ('NuvemShop (Pix)',     0.00, 0.35,  0.99, 2),
  ('NuvemShop Frente Caixa (Pix)', 0.00, 0.00, 0.99, 3),
  ('Mercado Livre',      11.50, 6.50,  4.99, 4),
  ('Shopee',             14.00, 4.00,  4.99, 5),
  ('Amazon',             15.00, 10.00, 4.99, 6),
  ('Magalu',             14.00, 10.00, 4.99, 7),
  ('Outros',             10.00, 10.00, 4.99, 8)
ON CONFLICT (nome) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- SEED: Itens de embalagem padrão
-- ══════════════════════════════════════════════════════════════
INSERT INTO financeiro.custos_embalagem (nome, custo_unitario, unidade) VALUES
  ('Sacola Personalizada Loja',  2.00, 'unid'),
  ('Caixa c/ visor',             3.30, 'unid'),
  ('Laço de cetim',              0.75, 'unid'),
  ('Papel seda',                 0.22, 'folha'),
  ('Etiqueta Logo',              0.25, 'unid'),
  ('Fita de cetim',              0.30, 'metro'),
  ('Saco grande',                0.26, 'unid'),
  ('Saquinho pequeno',           0.10, 'unid'),
  ('Bala Fini',                  1.10, 'unid'),
  ('Cartãozinho',                0.25, 'unid'),
  ('Bala Coração',               0.16, 'unid'),
  ('Sacola Rosa Pequena',        1.45, 'unid'),
  ('Perfume borrifado',          0.05, 'unid');

-- ══════════════════════════════════════════════════════════════
-- SEED: Kits de embalagem
-- ══════════════════════════════════════════════════════════════
INSERT INTO financeiro.kits_embalagem (nome, descricao) VALUES
  ('Kit Pequeno', 'Para pedidos pequenos e produtos avulsos'),
  ('Kit Médio',   'Para pedidos padrão com embalagem completa'),
  ('Kit Grande',  'Para pedidos grandes sem caixa de transporte');

-- Kit Pequeno: Sacola Rosa + Saquinho + Etiqueta + Bala Coração 2x + Perfume
INSERT INTO financeiro.kit_itens (kit_id, embalagem_id, quantidade)
SELECT k.id, e.id, CASE e.nome
    WHEN 'Sacola Rosa Pequena' THEN 1
    WHEN 'Saquinho pequeno'    THEN 1
    WHEN 'Etiqueta Logo'       THEN 1
    WHEN 'Bala Coração'        THEN 2
    WHEN 'Perfume borrifado'   THEN 1
  END
FROM financeiro.kits_embalagem k, financeiro.custos_embalagem e
WHERE k.nome = 'Kit Pequeno'
  AND e.nome IN ('Sacola Rosa Pequena','Saquinho pequeno','Etiqueta Logo','Bala Coração','Perfume borrifado');

-- Kit Médio: Sacola Personalizada + Laço + Etiqueta 2x + Bala Fini + Cartãozinho + Saco grande + Saco pequeno
INSERT INTO financeiro.kit_itens (kit_id, embalagem_id, quantidade)
SELECT k.id, e.id, CASE e.nome
    WHEN 'Sacola Personalizada Loja' THEN 1
    WHEN 'Laço de cetim'             THEN 1
    WHEN 'Etiqueta Logo'             THEN 2
    WHEN 'Bala Fini'                 THEN 1
    WHEN 'Cartãozinho'               THEN 1
    WHEN 'Saco grande'               THEN 1
    WHEN 'Saquinho pequeno'          THEN 1
  END
FROM financeiro.kits_embalagem k, financeiro.custos_embalagem e
WHERE k.nome = 'Kit Médio'
  AND e.nome IN ('Sacola Personalizada Loja','Laço de cetim','Etiqueta Logo','Bala Fini','Cartãozinho','Saco grande','Saquinho pequeno');

-- ══════════════════════════════════════════════════════════════
-- SEED: Despesas fixas reais
-- ══════════════════════════════════════════════════════════════
INSERT INTO financeiro.despesas_fixas (descricao, categoria_id, valor, dia_vencimento, observacoes, data_inicio)
SELECT descricao, c.id, valor, dia, obs, inicio::date
FROM (VALUES
  ('Loja NuvemShop',                  'Site',                      69.00, 10, 'Plano mensal loja online',                      '2025-12-01'),
  ('Hospedagem E-mail/DNS Hostinger', 'Site',                      19.00, 10, '12 parcelas - vence dezembro/2026',             '2025-12-01'),
  ('DAS MEI',                         'Darf MEI',                  88.00, 20, 'Imposto mensal MEI',                            '2025-12-01'),
  ('ERP Bling Plano Cobalto',         'ERP Bling',                 55.00, 10, 'Pagamento ERP mensal',                          '2025-12-01'),
  ('Canva PRO',                       'Canva PRO',                 47.00, 10, 'R$23,50 até mar/2026, depois R$47/mês',         '2025-12-01'),
  ('VPS Ubuntu Server (CRM/Dev)',     'Site',                      62.17, 10, '12 parcelas - vence março/2027',                '2025-12-01')
) AS v(descricao, cat_nome, valor, dia, obs, inicio)
JOIN financeiro.categorias c ON c.nome = v.cat_nome AND c.tipo = 'despesa';

-- ══════════════════════════════════════════════════════════════
-- SEED: Lançamentos reais (Dez/2025 e Jan/2026) — sem fornecedores
-- ══════════════════════════════════════════════════════════════
INSERT INTO financeiro.lancamentos (data, descricao, categoria_id, tipo, valor, status, observacoes, qtd_vendas)
SELECT data::date, descricao, c.id, v.tipo, valor, 'realizado', obs, qtd::integer
FROM (VALUES
  -- Dezembro 2025
  ('2025-12-02', 'Hospedagem Site Bibelo Hostinger par 3/12',  'Site',            'despesa', 18.68,  NULL, NULL),
  ('2025-12-18', 'Certificado Digital A1 (1 ano)',             'Certificado Digital A1 / Anual', 'despesa', 109.00, NULL, NULL),
  ('2025-12-21', 'Vendas à Vista do dia',                      'Vendas à Vista',  'receita', 165.65, '4 vendas via Pix', 4),
  ('2025-12-22', 'Vendas à Vista do dia',                      'Vendas à Vista',  'receita', 117.46, '6 vendas via Pix', 6),
  ('2025-12-23', 'Vendas à Vista do dia',                      'Vendas à Vista',  'receita', 240.08, '3 vendas via Pix', 3),
  ('2025-12-24', 'Vendas à Vista do dia',                      'Vendas à Vista',  'receita', 48.33,  '1 venda via Pix',  1),
  ('2025-12-25', 'Vendas à Vista do dia',                      'Vendas à Vista',  'receita', 36.41,  '2 vendas via Pix', 2),
  ('2025-12-02', 'Compra de domínio papelariabibelo.com.br',   'Site',            'despesa', 40.00,  NULL, NULL),
  ('2025-12-29', 'Etiquetas 500 porta',                        'Marketing e Publicidade', 'despesa', 64.90, '500 etiquetas 3cm', NULL),
  ('2025-12-29', 'Depósito pessoal na conta empresa',          'Outras Receitas', 'receita', 90.00,  NULL, NULL),
  ('2025-12-30', 'Vendas à Vista do dia',                      'Vendas à Vista',  'receita', 39.90,  '1 venda Pix',      1),
  ('2025-12-29', 'Compra de bala Fini',                        'Bala',            'despesa', 20.00,  NULL, NULL),
  -- Janeiro 2026
  ('2026-01-01', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 15.00,  '1 venda',          1),
  ('2026-01-02', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 327.60, '3 vendas',         3),
  ('2026-01-06', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 52.80,  '2 vendas',         2),
  ('2026-01-06', 'Compra Sacolas Medias MR Embalagens',        'Outras Despesas', 'despesa', 86.23,  NULL, NULL),
  ('2026-01-07', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 4.79,   '1 venda',          1),
  ('2026-01-07', 'DAS MEI 12/2025',                            'Darf MEI',        'despesa', 76.90,  NULL, NULL),
  ('2026-01-07', 'ERP Bling 1/12',                             'ERP Bling',       'despesa', 55.00,  NULL, NULL),
  ('2026-01-08', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 375.40, '4 vendas',         4),
  ('2026-01-09', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 130.60, '4 vendas',         4),
  ('2026-01-09', 'Compra de bala Fini',                        'Bala',            'despesa', 39.72,  NULL, NULL),
  ('2026-01-10', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 10.50,  '1 venda',          1),
  ('2026-01-12', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 196.50, '7 vendas',         7),
  ('2026-01-13', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 10.50,  '1 venda',          1),
  ('2026-01-14', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 96.00,  '2 vendas',         2),
  ('2026-01-15', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 88.70,  '3 vendas',         3),
  ('2026-01-16', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 137.50, '2 vendas',         2),
  ('2026-01-17', 'Compra material escritório',                 'Material de Escritório', 'despesa', 72.00, NULL, NULL),
  ('2026-01-18', 'Compra material escritório',                 'Material de Escritório', 'despesa', 108.97, NULL, NULL),
  ('2026-01-20', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 69.40,  '1 venda',          1),
  ('2026-01-20', 'Canva PRO 1/3',                              'Canva PRO',       'despesa', 23.50,  '3 meses nesse valor', NULL),
  ('2026-01-21', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 50.40,  '2 vendas',         2),
  ('2026-01-23', 'Propaganda Facebook',                        'Marketing e Publicidade', 'despesa', 15.74, NULL, NULL),
  ('2026-01-24', 'Vendas à Vista',                             'Vendas à Vista',  'receita', 39.80,  '2 vendas',         2),
  ('2026-01-26', 'Compra material escritório',                 'Material de Escritório', 'despesa', 32.67, NULL, NULL)
) AS v(data, descricao, cat_nome, tipo, valor, obs, qtd)
JOIN financeiro.categorias c ON c.nome = v.cat_nome AND c.tipo = v.tipo;
