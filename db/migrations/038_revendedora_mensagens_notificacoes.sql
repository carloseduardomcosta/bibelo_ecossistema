-- 038_revendedora_mensagens_notificacoes.sql
-- Sistema de mensagens por pedido (revendedora ↔ admin) + notificações CRM (sininho)

-- ── Mensagens por pedido ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.revendedora_pedido_mensagens (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id      UUID         NOT NULL REFERENCES crm.revendedora_pedidos(id) ON DELETE CASCADE,
  autor_tipo     VARCHAR(15)  NOT NULL CHECK (autor_tipo IN ('admin', 'revendedora')),
  autor_nome     VARCHAR(255) NOT NULL,
  conteudo       TEXT         NOT NULL CHECK (LENGTH(TRIM(conteudo)) > 0),
  lida           BOOLEAN      NOT NULL DEFAULT FALSE,
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rev_mensagens_pedido
  ON crm.revendedora_pedido_mensagens (pedido_id, criado_em ASC);
CREATE INDEX IF NOT EXISTS idx_rev_mensagens_nao_lidas
  ON crm.revendedora_pedido_mensagens (pedido_id)
  WHERE lida = FALSE;

-- ── Notificações CRM (sininho) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notificacoes (
  id        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo      VARCHAR(50) NOT NULL,   -- 'novo_pedido', 'nova_mensagem', 'nova_revendedora', ...
  titulo    VARCHAR(255) NOT NULL,
  corpo     TEXT,
  link      VARCHAR(500),           -- rota do CRM para navegar ao clicar
  lida      BOOLEAN     NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_nao_lidas
  ON public.notificacoes (criado_em DESC)
  WHERE lida = FALSE;
CREATE INDEX IF NOT EXISTS idx_notificacoes_criado
  ON public.notificacoes (criado_em DESC);
