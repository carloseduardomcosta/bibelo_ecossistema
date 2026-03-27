-- ══════════════════════════════════════════════════════════════
-- BibelôCRM — Migration 006 — Notas Fiscais de Entrada
-- Upload XML, parse automático, contabilização no financeiro
-- ══════════════════════════════════════════════════════════════

-- ── Notas Fiscais de Entrada ────────────────────────────────
CREATE TABLE financeiro.notas_entrada (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero            VARCHAR(20),
  serie             VARCHAR(5),
  chave_acesso      VARCHAR(44) UNIQUE,
  -- Fornecedor
  fornecedor_cnpj   VARCHAR(18),
  fornecedor_nome   VARCHAR(300),
  fornecedor_uf     VARCHAR(2),
  -- Valores
  valor_produtos    NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_frete       NUMERIC(12,2) DEFAULT 0,
  valor_desconto    NUMERIC(12,2) DEFAULT 0,
  valor_outros      NUMERIC(12,2) DEFAULT 0,
  valor_total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Impostos totais
  icms_total        NUMERIC(12,2) DEFAULT 0,
  ipi_total         NUMERIC(12,2) DEFAULT 0,
  pis_total         NUMERIC(12,2) DEFAULT 0,
  cofins_total      NUMERIC(12,2) DEFAULT 0,
  -- Datas
  data_emissao      DATE,
  data_entrada      DATE DEFAULT CURRENT_DATE,
  -- Arquivo
  xml_path          TEXT,
  xml_nome_arquivo  VARCHAR(255),
  -- Status e controle
  status            VARCHAR(15) NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente', 'contabilizada', 'cancelada')),
  lancamento_id     UUID REFERENCES financeiro.lancamentos(id) ON DELETE SET NULL,
  observacoes       TEXT,
  criado_por        UUID REFERENCES public.users(id),
  criado_em         TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nf_entrada_fornecedor ON financeiro.notas_entrada(fornecedor_cnpj);
CREATE INDEX idx_nf_entrada_data       ON financeiro.notas_entrada(data_emissao);
CREATE INDEX idx_nf_entrada_status     ON financeiro.notas_entrada(status);
CREATE INDEX idx_nf_entrada_numero     ON financeiro.notas_entrada(numero);

CREATE TRIGGER trg_nf_entrada_updated
  BEFORE UPDATE ON financeiro.notas_entrada
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ── Itens da NF de Entrada ──────────────────────────────────
CREATE TABLE financeiro.notas_entrada_itens (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nota_id           UUID NOT NULL REFERENCES financeiro.notas_entrada(id) ON DELETE CASCADE,
  numero_item       INTEGER NOT NULL,
  -- Produto
  codigo_produto    VARCHAR(60),
  descricao         VARCHAR(500) NOT NULL,
  ncm               VARCHAR(10),
  cfop              VARCHAR(5),
  unidade           VARCHAR(10),
  -- Valores
  quantidade        NUMERIC(12,4) NOT NULL DEFAULT 0,
  valor_unitario    NUMERIC(12,4) NOT NULL DEFAULT 0,
  valor_total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_desconto    NUMERIC(12,2) DEFAULT 0,
  -- Impostos do item
  icms_valor        NUMERIC(12,2) DEFAULT 0,
  ipi_valor         NUMERIC(12,2) DEFAULT 0,
  pis_valor         NUMERIC(12,2) DEFAULT 0,
  cofins_valor      NUMERIC(12,2) DEFAULT 0
);

CREATE INDEX idx_nf_itens_nota ON financeiro.notas_entrada_itens(nota_id);
